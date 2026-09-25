"""Approval routing shared by leave and WFH requests."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    ApprovalStage,
    Employee,
    EmployeeStatus,
    LeaveRequest,
    LeaveType,
    RequestHistory,
    RequestKind,
    RequestStatus,
    Role,
    WfhRequest,
    utcnow,
)
from . import balances, settings_service

MODELS = {
    RequestKind.LEAVE.value: LeaveRequest,
    RequestKind.WFH.value: WfhRequest,
}
FLOW_KEYS = {
    RequestKind.LEAVE.value: "leave_approval_flow",
    RequestKind.WFH.value: "wfh_approval_flow",
}


class ApprovalError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def hr_approvers(db: Session, exclude_id: int | None = None) -> list[Employee]:
    rows = db.scalars(
        select(Employee).where(
            Employee.status == EmployeeStatus.ACTIVE.value,
            Employee.role.in_([Role.HR.value, Role.ADMIN.value]),
        )
    ).all()
    others = [e for e in rows if e.id != exclude_id]
    return others or list(rows)


def record(
    db: Session,
    kind: str,
    request_id: int,
    action: str,
    actor_id: int | None,
    from_status: str | None = None,
    to_status: str | None = None,
    comment: str | None = None,
    is_override: bool = False,
) -> None:
    db.add(
        RequestHistory(
            request_kind=kind,
            request_id=request_id,
            action=action,
            from_status=from_status,
            to_status=to_status,
            actor_id=actor_id,
            comment=comment,
            is_override=is_override,
        )
    )


def history(db: Session, kind: str, request_id: int) -> list[RequestHistory]:
    return list(
        db.scalars(
            select(RequestHistory)
            .where(RequestHistory.request_kind == kind, RequestHistory.request_id == request_id)
            .order_by(RequestHistory.created_at, RequestHistory.id)
        )
    )


def route_initial(db: Session, kind: str, req, employee: Employee) -> None:
    """Set the first approval stage for a new (or modified) request."""
    flow = settings_service.get(db, FLOW_KEYS[kind])
    manager = employee.manager
    has_manager = manager is not None and manager.status == EmployeeStatus.ACTIVE.value and manager.id != employee.id
    req.status = RequestStatus.PENDING.value
    req.reminder_sent_at = None
    if flow in ("MANAGER", "MANAGER_THEN_HR") and has_manager:
        req.approval_stage = ApprovalStage.MANAGER.value
        req.current_approver_id = manager.id
    else:
        req.approval_stage = ApprovalStage.HR.value
        req.current_approver_id = None


def maybe_auto_approve(db: Session, kind: str, req, employee: Employee) -> bool:
    """Auto-approve when configured and nobody else could approve (e.g. the CEO / sole admin)."""
    if req.approval_stage != ApprovalStage.HR.value:
        return False
    if not settings_service.get(db, "auto_approve_when_no_approver"):
        return False
    if any(e.id != employee.id for e in hr_approvers(db)):
        return False
    req.status = RequestStatus.APPROVED.value
    req.decided_at = utcnow()
    req.decision_comment = "Auto-approved (no approver configured)"
    req.approval_stage = None
    record(db, kind, req.id, "AUTO_APPROVED", None, RequestStatus.PENDING.value, RequestStatus.APPROVED.value)
    return True


def approvers_for(db: Session, req) -> list[Employee]:
    if req.status != RequestStatus.PENDING.value:
        return []
    if req.approval_stage == ApprovalStage.MANAGER.value and req.current_approver_id:
        approver = db.get(Employee, req.current_approver_id)
        return [approver] if approver else []
    return hr_approvers(db, exclude_id=req.employee_id)


def can_act(user: Employee, req) -> tuple[bool, bool]:
    """Returns (allowed, is_override)."""
    if req.employee_id == user.id and not user.is_admin:
        return False, False
    if req.status == RequestStatus.PENDING.value:
        if req.approval_stage == ApprovalStage.MANAGER.value and req.current_approver_id == user.id:
            return True, False
        if req.approval_stage == ApprovalStage.HR.value and user.is_hr:
            return True, False
    if user.is_hr:
        return True, True
    return False, False


def decide(db: Session, kind: str, req, actor: Employee, approve: bool, comment: str | None) -> str:
    """Approve/reject a request. Returns APPROVED, REJECTED or ESCALATED (moved to HR stage)."""
    allowed, is_override = can_act(actor, req)
    if not allowed:
        raise ApprovalError("You are not allowed to act on this request", 403)

    current = req.status
    target = RequestStatus.APPROVED.value if approve else RequestStatus.REJECTED.value
    if current == RequestStatus.CANCELLED.value:
        raise ApprovalError("Request has been cancelled")
    if current == target:
        raise ApprovalError(f"Request is already {current.lower()}")
    if current != RequestStatus.PENDING.value and not actor.is_hr:
        raise ApprovalError("Only HR/Admin can override a decided request", 403)

    if kind == RequestKind.LEAVE.value and approve and current == RequestStatus.REJECTED.value:
        # Re-approving a rejected leave: make sure balance still covers it.
        lt = db.get(LeaveType, req.leave_type_id)
        emp = db.get(Employee, req.employee_id)
        if not lt.is_unlimited and not lt.allow_negative_balance:
            avail = balances.available_days(db, emp, lt, req.start_date.year)
            if avail < Decimal(req.total_days):
                raise ApprovalError(f"Insufficient balance ({avail} days available)")

    flow = settings_service.get(db, FLOW_KEYS[kind])
    if (
        approve
        and current == RequestStatus.PENDING.value
        and not is_override
        and req.approval_stage == ApprovalStage.MANAGER.value
        and flow == "MANAGER_THEN_HR"
    ):
        req.approval_stage = ApprovalStage.HR.value
        req.current_approver_id = None
        req.reminder_sent_at = None
        record(db, kind, req.id, "MANAGER_APPROVED", actor.id, current, current, comment)
        return "ESCALATED"

    req.status = target
    req.decided_by_id = actor.id
    req.decided_at = utcnow()
    req.decision_comment = comment
    req.approval_stage = None
    req.current_approver_id = None
    record(db, kind, req.id, "OVERRIDDEN" if is_override else target, actor.id, current, target, comment, is_override)
    return target


def cancel(db: Session, kind: str, req, actor: Employee, reason: str | None) -> str:
    """Employee cancels own request (pending, or approved and not yet started). HR can cancel anything."""
    previous = req.status
    if previous not in (RequestStatus.PENDING.value, RequestStatus.APPROVED.value):
        raise ApprovalError(f"Cannot cancel a {previous.lower()} request")
    if req.employee_id != actor.id and not actor.is_hr:
        raise ApprovalError("You can only cancel your own requests", 403)
    if previous == RequestStatus.APPROVED.value and not actor.is_hr and req.start_date <= date.today():
        raise ApprovalError("Approved requests that have already started can only be cancelled by HR")

    req.status = RequestStatus.CANCELLED.value
    req.cancelled_at = utcnow()
    req.cancel_reason = reason
    req.approval_stage = None
    req.current_approver_id = None
    record(db, kind, req.id, "CANCELLED", actor.id, previous, RequestStatus.CANCELLED.value, reason, actor.id != req.employee_id)
    return previous
