from datetime import date
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import and_, extract, select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import can_view_private, get_current_user, subordinate_ids
from ..database import get_db
from ..models import DurationType, Employee, LeaveRequest, LeaveType, RequestKind, RequestStatus
from ..schemas import CancelIn, LeaveApply
from ..services import approvals, balances, notifications, workdays

router = APIRouter(prefix="/leaves", tags=["leaves"])
KIND = RequestKind.LEAVE.value
ACTIVE = (RequestStatus.PENDING.value, RequestStatus.APPROVED.value)
_LOAD = (
    selectinload(LeaveRequest.employee).selectinload(Employee.designation),
    selectinload(LeaveRequest.employee).selectinload(Employee.department),
    selectinload(LeaveRequest.leave_type),
    selectinload(LeaveRequest.current_approver),
    selectinload(LeaveRequest.decided_by),
)


def _get(db: Session, leave_id: int) -> LeaveRequest:
    req = db.scalar(select(LeaveRequest).options(*_LOAD).where(LeaveRequest.id == leave_id))
    if req is None:
        raise HTTPException(404, "Leave request not found")
    return req


def _target_employee(db: Session, user: Employee, employee_id: int | None) -> Employee:
    if employee_id is None or employee_id == user.id:
        return user
    if not user.is_hr:
        raise HTTPException(403, "Only HR can apply leave on behalf of others")
    emp = db.get(Employee, employee_id)
    if emp is None or emp.status != "ACTIVE":
        raise HTTPException(404, "Employee not found")
    return emp


def evaluate(db: Session, actor: Employee, emp: Employee, body: LeaveApply, exclude_id: int | None = None) -> dict:
    """Validate a leave application and compute its cost in days. Raises HTTPException on rule violations."""
    lt = db.get(LeaveType, body.leave_type_id)
    if lt is None or not lt.is_active:
        raise HTTPException(400, "Invalid leave type")
    if not balances.applies_to(db, lt, emp):
        raise HTTPException(400, f"{lt.name} ({lt.code}) is not available for employees in {emp.country_code or 'this location'}")
    dt = body.duration_type.value
    if dt == DurationType.HALF_DAY.value and not lt.allow_half_day:
        raise HTTPException(400, f"{lt.name} cannot be taken as half-day")
    if body.start_date.year != body.end_date.year:
        raise HTTPException(400, "A leave cannot span two calendar years — please split it into two requests")
    if body.start_date < emp.joining_date:
        raise HTTPException(400, "Leave cannot start before the joining date")

    today = date.today()
    privileged = actor.is_hr
    if body.start_date < today and not lt.allow_backdated and not privileged:
        raise HTTPException(400, f"{lt.name} cannot be applied for past dates")
    if lt.min_notice_days and (body.start_date - today).days < lt.min_notice_days and not privileged:
        raise HTTPException(400, f"{lt.name} requires at least {lt.min_notice_days} day(s) notice")

    off = workdays.non_working_dates(db, body.start_date, body.end_date, emp.id)
    working = [d for d in workdays.daterange(body.start_date, body.end_date) if d not in off]
    if not working:
        raise HTTPException(400, "The selected dates are all weekends or holidays")

    if dt == DurationType.FULL_DAY.value:
        total = Decimal(len(working))
        if lt.max_consecutive_days and total > lt.max_consecutive_days:
            raise HTTPException(400, f"{lt.name} allows at most {lt.max_consecutive_days} consecutive working days")
    else:
        total = Decimal("0.5")

    # Overlap check against the employee's other active leave requests.
    clashes = db.scalars(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == emp.id,
            LeaveRequest.status.in_(ACTIVE),
            LeaveRequest.start_date <= body.end_date,
            LeaveRequest.end_date >= body.start_date,
            LeaveRequest.id != (exclude_id or 0),
        )
    ).all()
    if clashes:
        partial = dt != DurationType.FULL_DAY.value and all(c.duration_type != DurationType.FULL_DAY.value for c in clashes)
        same_session = any(
            dt == DurationType.HALF_DAY.value
            and c.duration_type == DurationType.HALF_DAY.value
            and c.half_day_session == body.half_day_session.value
            for c in clashes
        )
        booked = sum((Decimal(c.total_days) for c in clashes), Decimal(0))
        if not partial or same_session or booked + total > 1:
            c = clashes[0]
            raise HTTPException(400, f"Overlaps with an existing {c.status.lower()} leave ({c.start_date} – {c.end_date})")

    available = None
    if not lt.is_unlimited:
        available = balances.available_days(db, emp, lt, body.start_date.year, exclude_id)
        if not lt.allow_negative_balance and total > available:
            raise HTTPException(400, f"Insufficient {lt.name} balance: {available:g} day(s) available, {total:g} requested")

    return {
        "leave_type": lt,
        "total_days": total,
        "working_dates": working,
        "non_working": [{"date": d, "reason": r} for d, r in sorted(off.items())],
        "available": available,
    }


@router.get("/my")
def my_leaves(year: int | None = None, status: str | None = None, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    stmt = select(LeaveRequest).options(*_LOAD).where(LeaveRequest.employee_id == user.id)
    if year:
        stmt = stmt.where(extract("year", LeaveRequest.start_date) == year)
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    return [S.leave_request(r) for r in db.scalars(stmt.order_by(LeaveRequest.start_date.desc()))]


@router.get("/my/balances")
def my_balances(year: int | None = None, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    result = balances.employee_balances(db, user, year or date.today().year)
    db.commit()
    return result


@router.post("/preview")
def preview(
    body: LeaveApply,
    exclude_id: int | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Dry-run of an application (or a modification when `exclude_id` is the request being edited)."""
    emp = _target_employee(db, user, body.employee_id)
    if exclude_id:
        existing = db.get(LeaveRequest, exclude_id)
        if existing is None or existing.employee_id != emp.id:
            exclude_id = None
    try:
        result = evaluate(db, user, emp, body, exclude_id)
    finally:
        db.rollback()
    avail = result["available"]
    return {
        "total_days": float(result["total_days"]),
        "working_dates": result["working_dates"],
        "non_working": result["non_working"],
        "available": None if avail is None else float(avail),
        "balance_after": None if avail is None else float(avail - result["total_days"]),
    }


@router.post("", status_code=201)
def apply_leave(
    body: LeaveApply, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)
):
    emp = _target_employee(db, user, body.employee_id)
    result = evaluate(db, user, emp, body)
    req = LeaveRequest(
        employee_id=emp.id,
        leave_type_id=body.leave_type_id,
        start_date=body.start_date,
        end_date=body.end_date,
        duration_type=body.duration_type.value,
        half_day_session=body.half_day_session.value if body.duration_type == DurationType.HALF_DAY else None,
        total_days=result["total_days"],
        reason=body.reason,
    )
    db.add(req)
    approvals.route_initial(db, KIND, req, emp)
    db.flush()
    comment = None if emp.id == user.id else f"Applied by {user.full_name} on behalf of employee"
    approvals.record(db, KIND, req.id, "APPLIED", user.id, None, RequestStatus.PENDING.value, comment)
    approvals.maybe_auto_approve(db, KIND, req, emp)
    db.commit()
    if req.status == RequestStatus.PENDING.value:
        background.add_task(notifications.send, notifications.request_submitted(db, KIND, req))
    return S.leave_request(_get(db, req.id))


@router.get("")
def list_leaves(
    employee_id: int | None = None,
    department_id: int | None = None,
    leave_type_id: int | None = None,
    status: str | None = None,
    start: date | None = None,
    end: date | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """HR sees everyone; managers see their (indirect) reports; employees only themselves."""
    stmt = select(LeaveRequest).options(*_LOAD).join(Employee, Employee.id == LeaveRequest.employee_id)
    if not user.is_hr:
        visible = subordinate_ids(db, user.id) | {user.id}
        stmt = stmt.where(LeaveRequest.employee_id.in_(visible))
    if employee_id:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if leave_type_id:
        stmt = stmt.where(LeaveRequest.leave_type_id == leave_type_id)
    if status:
        stmt = stmt.where(LeaveRequest.status == status)
    if start:
        stmt = stmt.where(LeaveRequest.end_date >= start)
    if end:
        stmt = stmt.where(LeaveRequest.start_date <= end)
    return [S.leave_request(r) for r in db.scalars(stmt.order_by(LeaveRequest.start_date.desc()).limit(1000))]


@router.get("/{leave_id}")
def get_leave(leave_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    req = _get(db, leave_id)
    if not (can_view_private(db, user, req.employee_id) or req.current_approver_id == user.id):
        raise HTTPException(403, "Not allowed")
    can_approve, is_override = approvals.can_act(user, req)
    return {
        **S.leave_request(req),
        "history": [S.history(h) for h in approvals.history(db, KIND, req.id)],
        "can_approve": can_approve and req.status == RequestStatus.PENDING.value,
        "can_override": can_approve and is_override,
    }


@router.put("/{leave_id}")
def modify_leave(
    leave_id: int,
    body: LeaveApply,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    req = _get(db, leave_id)
    if req.employee_id != user.id and not user.is_hr:
        raise HTTPException(403, "You can only modify your own leave")
    if req.status == RequestStatus.APPROVED.value and req.start_date <= date.today() and not user.is_hr:
        raise HTTPException(400, "Leave that has already started cannot be modified")
    if req.status not in ACTIVE:
        raise HTTPException(400, f"A {req.status.lower()} request cannot be modified")
    emp = db.get(Employee, req.employee_id)
    result = evaluate(db, user, emp, body, exclude_id=req.id)
    previous = req.status
    before = f"{req.start_date}→{req.end_date} ({float(req.total_days):g}d)"
    req.leave_type_id = body.leave_type_id
    req.start_date = body.start_date
    req.end_date = body.end_date
    req.duration_type = body.duration_type.value
    req.half_day_session = body.half_day_session.value if body.duration_type == DurationType.HALF_DAY else None
    req.total_days = result["total_days"]
    req.reason = body.reason
    req.decided_by_id = None
    req.decided_at = None
    req.decision_comment = None
    approvals.route_initial(db, KIND, req, emp)  # modified requests go back for approval
    approvals.record(db, KIND, req.id, "MODIFIED", user.id, previous, RequestStatus.PENDING.value, f"Previously {before}")
    approvals.maybe_auto_approve(db, KIND, req, emp)
    db.commit()
    db.refresh(req)
    if req.status == RequestStatus.PENDING.value:
        background.add_task(notifications.send, notifications.request_submitted(db, KIND, req, modified=True))
    return S.leave_request(_get(db, req.id))


@router.post("/{leave_id}/cancel")
def cancel_leave(
    leave_id: int,
    body: CancelIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    req = _get(db, leave_id)
    notify = approvals.approvers_for(db, req)
    emp = db.get(Employee, req.employee_id)
    if emp.manager:
        notify.append(emp.manager)
    try:
        approvals.cancel(db, KIND, req, user, body.reason)
    except approvals.ApprovalError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    db.commit()
    background.add_task(notifications.send, notifications.request_cancelled(db, KIND, req, user, notify))
    return S.leave_request(_get(db, req.id))


def calendar_entries(db: Session, start: date, end: date, employee_ids: set[int] | None, include_pending: bool = True) -> list[dict]:
    statuses = list(ACTIVE) if include_pending else [RequestStatus.APPROVED.value]
    stmt = select(LeaveRequest).options(*_LOAD).where(
        and_(LeaveRequest.start_date <= end, LeaveRequest.end_date >= start, LeaveRequest.status.in_(statuses))
    )
    if employee_ids is not None:
        stmt = stmt.where(LeaveRequest.employee_id.in_(employee_ids or {0}))
    return [S.leave_request(r) for r in db.scalars(stmt)]

