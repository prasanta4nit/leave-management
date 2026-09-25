"""Employee services: work-from-home requests."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import can_view_private, get_current_user
from ..database import get_db
from ..models import Employee, RequestKind, RequestStatus, WfhRequest
from ..schemas import CancelIn, WfhApply
from ..services import approvals, notifications, settings_service, workdays

router = APIRouter(tags=["employee-services"])
ACTIVE = (RequestStatus.PENDING.value, RequestStatus.APPROVED.value)


def _load(model):
    return (
        selectinload(model.employee).selectinload(Employee.designation),
        selectinload(model.employee).selectinload(Employee.department),
        selectinload(model.current_approver),
        selectinload(model.decided_by),
    )


def _get(db: Session, model, rid: int):
    req = db.scalar(select(model).options(*_load(model)).where(model.id == rid))
    if req is None:
        raise HTTPException(404, "Request not found")
    return req


def _submit(db: Session, background: BackgroundTasks, kind: str, req, emp: Employee, actor: Employee):
    db.add(req)
    approvals.route_initial(db, kind, req, emp)
    db.flush()
    approvals.record(db, kind, req.id, "APPLIED", actor.id, None, RequestStatus.PENDING.value)
    try:
        approvals.maybe_auto_approve(db, kind, req, emp)
    except approvals.ApprovalError as exc:
        db.rollback()
        raise HTTPException(exc.status_code, str(exc)) from exc
    db.commit()
    if req.status == RequestStatus.PENDING.value:
        background.add_task(notifications.send, notifications.request_submitted(db, kind, req))


def _cancel(db: Session, background: BackgroundTasks, kind: str, req, user: Employee, reason: str | None):
    notify = approvals.approvers_for(db, req)
    emp = db.get(Employee, req.employee_id)
    if emp.manager:
        notify.append(emp.manager)
    try:
        approvals.cancel(db, kind, req, user, reason)
    except approvals.ApprovalError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc
    db.commit()
    background.add_task(notifications.send, notifications.request_cancelled(db, kind, req, user, notify))


def _detail(db: Session, kind: str, req, user: Employee) -> dict:
    if not (can_view_private(db, user, req.employee_id) or req.current_approver_id == user.id):
        raise HTTPException(403, "Not allowed")
    can, override = approvals.can_act(user, req)
    return {
        **S.any_request(kind, req),
        "history": [S.history(h) for h in approvals.history(db, kind, req.id)],
        "can_approve": can and req.status == RequestStatus.PENDING.value,
        "can_override": can and override,
    }


# ---- Work from home -----------------------------------------------------------

@router.get("/wfh/my")
def my_wfh(year: int | None = None, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    stmt = select(WfhRequest).options(*_load(WfhRequest)).where(WfhRequest.employee_id == user.id)
    if year:
        stmt = stmt.where(extract("year", WfhRequest.start_date) == year)
    return [S.wfh_request(r) for r in db.scalars(stmt.order_by(WfhRequest.start_date.desc()))]


@router.post("/wfh", status_code=201)
def apply_wfh(body: WfhApply, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    if body.start_date < date.today() - timedelta(days=7):
        raise HTTPException(400, "WFH can be applied at most 7 days in the past")
    working = workdays.working_dates(db, body.start_date, body.end_date, user.id)
    if not working:
        raise HTTPException(400, "The selected dates are all weekends or holidays")
    clash = db.scalar(
        select(WfhRequest).where(
            WfhRequest.employee_id == user.id,
            WfhRequest.status.in_(ACTIVE),
            WfhRequest.start_date <= body.end_date,
            WfhRequest.end_date >= body.start_date,
        )
    )
    if clash:
        raise HTTPException(400, f"Overlaps with an existing WFH request ({clash.start_date} – {clash.end_date})")

    limit = int(settings_service.get(db, "max_wfh_days_per_month") or 0)
    if limit:
        month_start = body.start_date.replace(day=1)
        used = db.scalar(
            select(func.coalesce(func.sum(WfhRequest.total_days), 0)).where(
                WfhRequest.employee_id == user.id,
                WfhRequest.status.in_(ACTIVE),
                extract("year", WfhRequest.start_date) == month_start.year,
                extract("month", WfhRequest.start_date) == month_start.month,
            )
        )
        if Decimal(str(used)) + len(working) > limit:
            raise HTTPException(400, f"Monthly WFH limit is {limit} days ({float(used):g} already requested)")

    req = WfhRequest(
        employee_id=user.id, start_date=body.start_date, end_date=body.end_date, total_days=len(working), reason=body.reason
    )
    _submit(db, background, RequestKind.WFH.value, req, user, user)
    return S.wfh_request(_get(db, WfhRequest, req.id))


@router.get("/wfh/{rid}")
def get_wfh(rid: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    return _detail(db, RequestKind.WFH.value, _get(db, WfhRequest, rid), user)


@router.post("/wfh/{rid}/cancel")
def cancel_wfh(rid: int, body: CancelIn, background: BackgroundTasks, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    req = _get(db, WfhRequest, rid)
    _cancel(db, background, RequestKind.WFH.value, req, user, body.reason)
    return S.wfh_request(_get(db, WfhRequest, rid))

