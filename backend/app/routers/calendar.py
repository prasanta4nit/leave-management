"""Holidays, optional holidays and the team leave calendar."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, extract, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, require_hr, subordinate_ids
from ..database import get_db
from ..models import Employee, Holiday, OptionalHolidaySelection, RequestStatus, WfhRequest
from ..schemas import HolidayIn
from ..services import audit, settings_service
from .leaves import calendar_entries

router = APIRouter(tags=["calendar"])


def _opted(db: Session, employee_id: int) -> set[int]:
    return set(db.scalars(select(OptionalHolidaySelection.holiday_id).where(OptionalHolidaySelection.employee_id == employee_id)))


@router.get("/holidays")
def list_holidays(year: int | None = None, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    year = year or date.today().year
    opted = _opted(db, user.id)
    rows = db.scalars(select(Holiday).where(extract("year", Holiday.date) == year).order_by(Holiday.date))
    return [S.holiday(h, h.id in opted if h.is_optional else None) for h in rows]


@router.get("/holidays/upcoming")
def upcoming_holidays(limit: int = 5, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    opted = _opted(db, user.id)
    rows = db.scalars(select(Holiday).where(Holiday.date >= date.today()).order_by(Holiday.date).limit(limit))
    return [S.holiday(h, h.id in opted if h.is_optional else None) for h in rows]


@router.post("/holidays", status_code=201)
def create_holiday(body: HolidayIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    h = Holiday(**body.model_dump())
    db.add(h)
    try:
        db.flush()
        audit.log(db, user.id, "holiday", h.id, "CREATE", body.model_dump())
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This holiday already exists") from exc
    return S.holiday(h)


@router.put("/holidays/{holiday_id}")
def update_holiday(holiday_id: int, body: HolidayIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "Holiday not found")
    for k, v in body.model_dump().items():
        setattr(h, k, v)
    audit.log(db, user.id, "holiday", h.id, "UPDATE", body.model_dump())
    db.commit()
    return S.holiday(h)


@router.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "Holiday not found")
    audit.log(db, user.id, "holiday", h.id, "DELETE", {"name": h.name, "date": h.date})
    db.delete(h)
    db.commit()
    return {"ok": True}


@router.post("/holidays/{holiday_id}/opt-in")
def opt_in(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    h = db.get(Holiday, holiday_id)
    if h is None or not h.is_optional:
        raise HTTPException(400, "Not an optional holiday")
    if h.date < date.today():
        raise HTTPException(400, "This holiday has already passed")
    limit = int(settings_service.get(db, "max_optional_holidays") or 0)
    taken = db.scalar(
        select(func.count())
        .select_from(OptionalHolidaySelection)
        .join(Holiday, Holiday.id == OptionalHolidaySelection.holiday_id)
        .where(OptionalHolidaySelection.employee_id == user.id, extract("year", Holiday.date) == h.date.year)
    )
    if taken >= limit:
        raise HTTPException(400, f"You can choose at most {limit} optional holidays per year")
    if holiday_id in _opted(db, user.id):
        return {"ok": True}
    db.add(OptionalHolidaySelection(employee_id=user.id, holiday_id=h.id))
    db.commit()
    return {"ok": True}


@router.delete("/holidays/{holiday_id}/opt-in")
def opt_out(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    sel = db.scalar(
        select(OptionalHolidaySelection).where(
            OptionalHolidaySelection.employee_id == user.id, OptionalHolidaySelection.holiday_id == holiday_id
        )
    )
    if sel is None:
        return {"ok": True}
    if sel.holiday.date < date.today():
        raise HTTPException(400, "Cannot opt out of a past holiday")
    db.delete(sel)
    db.commit()
    return {"ok": True}


def team_ids(db: Session, user: Employee) -> set[int]:
    """Self, manager, peers and everyone below the user."""
    ids = {user.id} | subordinate_ids(db, user.id)
    if user.manager_id:
        ids.add(user.manager_id)
        ids |= set(db.scalars(select(Employee.id).where(Employee.manager_id == user.manager_id)))
    return ids


@router.get("/calendar")
def team_calendar(
    start: date | None = None,
    end: date | None = None,
    scope: str = "team",
    department_id: int | None = None,
    include_pending: bool = True,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    start = start or date.today().replace(day=1)
    end = end or (start + timedelta(days=41))
    if (end - start).days > 400:
        raise HTTPException(400, "Range too large")

    active = set(db.scalars(select(Employee.id).where(Employee.status == "ACTIVE")))
    if scope == "me":
        ids = {user.id}
    elif scope == "department":
        dept = department_id or user.department_id
        ids = set(db.scalars(select(Employee.id).where(Employee.department_id == dept)))
    elif scope == "company":
        ids = active
    else:
        ids = team_ids(db, user)
    ids &= active

    leaves = calendar_entries(db, start, end, ids, include_pending)
    wfh = db.scalars(
        select(WfhRequest)
        .options(selectinload(WfhRequest.employee), selectinload(WfhRequest.current_approver), selectinload(WfhRequest.decided_by))
        .where(
            and_(
                WfhRequest.start_date <= end,
                WfhRequest.end_date >= start,
                WfhRequest.employee_id.in_(ids or {0}),
                WfhRequest.status.in_([RequestStatus.APPROVED.value] + ([RequestStatus.PENDING.value] if include_pending else [])),
            )
        )
    )
    opted = _opted(db, user.id)
    holidays = db.scalars(select(Holiday).where(Holiday.date >= start, Holiday.date <= end).order_by(Holiday.date))

    # Hide leave reasons for people the viewer can't see privately.
    private_ids = None if user.is_hr else subordinate_ids(db, user.id) | {user.id}
    leave_items = []
    for item in leaves:
        if private_ids is not None and item["employee"]["id"] not in private_ids:
            item = {**item, "reason": None, "decision_comment": None}
        leave_items.append(item)

    return {
        "start": start,
        "end": end,
        "weekend_days": settings_service.get(db, "weekend_days"),
        "holidays": [S.holiday(h, h.id in opted if h.is_optional else None) for h in holidays],
        "leaves": leave_items,
        "wfh": [S.wfh_request(w) for w in wfh],
        "members": len(ids),
    }
