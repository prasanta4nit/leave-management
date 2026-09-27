"""Weekend / holiday aware day counting, per employee holiday calendar."""

from datetime import date, timedelta

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..models import Employee, Holiday, OptionalHolidaySelection
from . import calendars


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def non_working_dates(db: Session, start: date, end: date, employee_id: int | None = None) -> dict[date, str]:
    """Map of date -> reason ('Weekend' or holiday name) for dates that are not working days.

    Uses the employee's holiday calendar (weekend days + mandatory holidays + their chosen optional
    holidays). Without an employee, the default calendar applies.
    """
    employee = db.get(Employee, employee_id) if employee_id is not None else None
    cal = calendars.calendar_for(db, employee)
    weekend = set(calendars.weekend_days(db, cal))
    result: dict[date, str] = {d: "Weekend" for d in daterange(start, end) if d.weekday() in weekend}
    if cal is None:
        return result

    for h in db.scalars(
        select(Holiday).where(
            and_(
                Holiday.calendar_id == cal.id,
                Holiday.date >= start,
                Holiday.date <= end,
                Holiday.is_optional.is_(False),
            )
        )
    ):
        result[h.date] = h.name

    if employee is not None:
        rows = db.execute(
            select(Holiday)
            .join(OptionalHolidaySelection, OptionalHolidaySelection.holiday_id == Holiday.id)
            .where(
                OptionalHolidaySelection.employee_id == employee.id,
                Holiday.calendar_id == cal.id,  # selections from a previous calendar no longer apply
                Holiday.date >= start,
                Holiday.date <= end,
            )
        ).scalars()
        for h in rows:
            result[h.date] = f"{h.name} (optional)"
    return result


def working_dates(db: Session, start: date, end: date, employee_id: int | None = None) -> list[date]:
    off = non_working_dates(db, start, end, employee_id)
    return [d for d in daterange(start, end) if d not in off]

