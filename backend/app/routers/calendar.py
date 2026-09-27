"""Holiday calendars (per country), holidays, optional holidays and the team leave calendar."""

from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, extract, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, require_hr, subordinate_ids
from ..database import get_db
from ..models import Employee, Holiday, HolidayCalendar, OptionalHolidaySelection, RequestStatus, WfhRequest
from ..schemas import HolidayCalendarIn, HolidayIn
from ..services import audit, calendars, settings_service
from .leaves import calendar_entries

router = APIRouter(tags=["calendar"])


def _opted(db: Session, employee_id: int) -> set[int]:
    return set(db.scalars(select(OptionalHolidaySelection.holiday_id).where(OptionalHolidaySelection.employee_id == employee_id)))


def _holiday_query():
    return select(Holiday).options(selectinload(Holiday.calendar)).order_by(Holiday.date)


def _resolve_calendar_id(db: Session, user: Employee, calendar_id: int | None) -> int | None:
    if calendar_id is not None:
        if db.get(HolidayCalendar, calendar_id) is None:
            raise HTTPException(404, "Holiday calendar not found")
        return calendar_id
    cal = calendars.calendar_for(db, user)
    return cal.id if cal else None


# ---- Holiday calendars --------------------------------------------------------

@router.get("/holiday-calendars")
def list_calendars(db: Session = Depends(get_db), _: Employee = Depends(get_current_user)):
    cals = list(db.scalars(select(HolidayCalendar).order_by(HolidayCalendar.is_default.desc(), HolidayCalendar.name)))
    holiday_counts = dict(
        db.execute(
            select(Holiday.calendar_id, func.count())
            .where(extract("year", Holiday.date) == date.today().year)
            .group_by(Holiday.calendar_id)
        ).all()
    )
    employees = list(db.scalars(select(Employee).where(Employee.status == "ACTIVE")))
    emp_counts = Counter(c.id for c in calendars.effective_map(db, employees).values() if c)
    return [S.holiday_calendar(c, holiday_counts.get(c.id, 0), emp_counts.get(c.id, 0)) for c in cals]


def _apply_default(db: Session, cal: HolidayCalendar) -> None:
    if cal.is_default:
        db.execute(update(HolidayCalendar).where(HolidayCalendar.id != cal.id).values(is_default=False))


@router.post("/holiday-calendars", status_code=201)
def create_calendar(body: HolidayCalendarIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    cal = HolidayCalendar(**body.model_dump())
    if db.scalar(select(func.count()).select_from(HolidayCalendar)) == 0:
        cal.is_default = True  # the first calendar is always the default
    db.add(cal)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A calendar with this name already exists") from exc
    _apply_default(db, cal)
    audit.log(db, user.id, "holiday_calendar", cal.id, "CREATE", body.model_dump())
    db.commit()
    return S.holiday_calendar(cal, 0, 0)


@router.put("/holiday-calendars/{calendar_id}")
def update_calendar(calendar_id: int, body: HolidayCalendarIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    cal = db.get(HolidayCalendar, calendar_id)
    if cal is None:
        raise HTTPException(404, "Holiday calendar not found")
    if cal.is_default and not body.is_default:
        raise HTTPException(400, "Mark another calendar as default instead of un-setting the default")
    before = S.holiday_calendar(cal)
    for k, v in body.model_dump().items():
        setattr(cal, k, v)
    _apply_default(db, cal)
    audit.log(db, user.id, "holiday_calendar", cal.id, "UPDATE", {"before": before, "after": body.model_dump()})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A calendar with this name already exists") from exc
    return S.holiday_calendar(cal)


@router.delete("/holiday-calendars/{calendar_id}")
def delete_calendar(calendar_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    cal = db.get(HolidayCalendar, calendar_id)
    if cal is None:
        raise HTTPException(404, "Holiday calendar not found")
    if cal.is_default:
        raise HTTPException(400, "The default calendar cannot be deleted")
    employees = list(db.scalars(select(Employee).where(Employee.status == "ACTIVE")))
    in_use = sum(1 for c in calendars.effective_map(db, employees).values() if c and c.id == cal.id)
    if in_use:
        raise HTTPException(400, f"{in_use} active employee(s) use this calendar - reassign them first")
    audit.log(db, user.id, "holiday_calendar", cal.id, "DELETE", {"name": cal.name})
    db.execute(update(Employee).where(Employee.holiday_calendar_id == cal.id).values(holiday_calendar_id=None))
    db.execute(Holiday.__table__.delete().where(Holiday.calendar_id == cal.id))
    db.delete(cal)
    db.commit()
    return {"ok": True}


# ---- Holidays -----------------------------------------------------------------

@router.get("/holidays")
def list_holidays(
    year: int | None = None,
    calendar_id: int | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """Holidays of one calendar (default: the viewer's own calendar)."""
    year = year or date.today().year
    cal_id = _resolve_calendar_id(db, user, calendar_id)
    mine = calendars.calendar_for(db, user)
    opted = _opted(db, user.id)
    rows = db.scalars(_holiday_query().where(extract("year", Holiday.date) == year, Holiday.calendar_id == cal_id))
    own = mine is not None and mine.id == cal_id
    return [S.holiday(h, (h.id in opted) if (h.is_optional and own) else None) for h in rows]


@router.get("/holidays/upcoming")
def upcoming_holidays(limit: int = 5, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    cal = calendars.calendar_for(db, user)
    if cal is None:
        return []
    opted = _opted(db, user.id)
    rows = db.scalars(_holiday_query().where(Holiday.date >= date.today(), Holiday.calendar_id == cal.id).limit(limit))
    return [S.holiday(h, h.id in opted if h.is_optional else None) for h in rows]


@router.post("/holidays", status_code=201)
def create_holiday(body: HolidayIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    data = body.model_dump()
    if data["calendar_id"] is None:
        default = calendars.default_calendar(db)
        if default is None:
            raise HTTPException(400, "Create a holiday calendar first")
        data["calendar_id"] = default.id
    elif db.get(HolidayCalendar, data["calendar_id"]) is None:
        raise HTTPException(404, "Holiday calendar not found")
    h = Holiday(**data)
    db.add(h)
    try:
        db.flush()
        audit.log(db, user.id, "holiday", h.id, "CREATE", data)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "This holiday already exists in the calendar") from exc
    db.refresh(h)
    return S.holiday(h)


@router.put("/holidays/{holiday_id}")
def update_holiday(holiday_id: int, body: HolidayIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "Holiday not found")
    data = body.model_dump()
    if data["calendar_id"] is None:
        data["calendar_id"] = h.calendar_id
    elif db.get(HolidayCalendar, data["calendar_id"]) is None:
        raise HTTPException(404, "Holiday calendar not found")
    for k, v in data.items():
        setattr(h, k, v)
    audit.log(db, user.id, "holiday", h.id, "UPDATE", data)
    db.commit()
    db.refresh(h)
    return S.holiday(h)


@router.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    h = db.get(Holiday, holiday_id)
    if h is None:
        raise HTTPException(404, "Holiday not found")
    audit.log(db, user.id, "holiday", h.id, "DELETE", {"name": h.name, "date": h.date, "calendar_id": h.calendar_id})
    db.delete(h)
    db.commit()
    return {"ok": True}


@router.post("/holidays/{holiday_id}/opt-in")
def opt_in(holiday_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    h = db.get(Holiday, holiday_id)
    if h is None or not h.is_optional:
        raise HTTPException(400, "Not an optional holiday")
    mine = calendars.calendar_for(db, user)
    if mine is None or h.calendar_id != mine.id:
        raise HTTPException(400, "This holiday is not part of your holiday calendar")
    if h.date < date.today():
        raise HTTPException(400, "This holiday has already passed")
    if holiday_id in _opted(db, user.id):
        return {"ok": True}
    limit = int(settings_service.get(db, "max_optional_holidays") or 0)
    taken = db.scalar(
        select(func.count())
        .select_from(OptionalHolidaySelection)
        .join(Holiday, Holiday.id == OptionalHolidaySelection.holiday_id)
        .where(
            OptionalHolidaySelection.employee_id == user.id,
            Holiday.calendar_id == mine.id,
            extract("year", Holiday.date) == h.date.year,
        )
    )
    if taken >= limit:
        raise HTTPException(400, f"You can choose at most {limit} optional holidays per year")
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


# ---- Team calendar ------------------------------------------------------------

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

    active = {e.id: e for e in db.scalars(select(Employee).where(Employee.status == "ACTIVE"))}
    if scope == "me":
        ids = {user.id}
    elif scope == "department":
        dept = department_id or user.department_id
        ids = {i for i, e in active.items() if e.department_id == dept}
    elif scope == "company":
        ids = set(active)
    else:
        ids = team_ids(db, user)
    ids &= set(active)

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

    # Holidays from every calendar used by people in view (plus the viewer's own), with headcounts.
    cal_map = calendars.effective_map(db, [active[i] for i in ids] + [user])
    members_per_cal = Counter(cal_map[i].id for i in ids if cal_map.get(i))
    cal_ids = set(members_per_cal) | ({cal_map[user.id].id} if cal_map.get(user.id) else set())
    opted = _opted(db, user.id)
    own_cal = cal_map.get(user.id)
    holidays = db.scalars(
        _holiday_query().where(Holiday.date >= start, Holiday.date <= end, Holiday.calendar_id.in_(cal_ids or {0}))
    )

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
        "weekend_days": calendars.weekend_days(db, own_cal),
        "holidays": [
            {
                **S.holiday(h, (h.id in opted) if (h.is_optional and own_cal and h.calendar_id == own_cal.id) else None),
                "members_affected": members_per_cal.get(h.calendar_id, 0),
            }
            for h in holidays
        ],
        "calendars": [calendars.brief(c) for c in {c.id: c for c in cal_map.values() if c}.values() if c.id in cal_ids],
        "leaves": leave_items,
        "wfh": [S.wfh_request(w) for w in wfh],
        "members": len(ids),
    }
