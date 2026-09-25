"""Weekend / holiday aware day counting."""

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..models import Holiday, OptionalHolidaySelection
from . import settings_service


def daterange(start: date, end: date):
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def non_working_dates(db: Session, start: date, end: date, employee_id: int | None = None) -> dict[date, str]:
    """Map of date -> reason ('Weekend' or holiday name) for dates that are not working days."""
    weekend = set(settings_service.get(db, "weekend_days"))
    result: dict[date, str] = {d: "Weekend" for d in daterange(start, end) if d.weekday() in weekend}

    for h in db.scalars(
        select(Holiday).where(and_(Holiday.date >= start, Holiday.date <= end, Holiday.is_optional.is_(False)))
    ):
        result[h.date] = h.name

    if employee_id is not None:
        rows = db.execute(
            select(Holiday)
            .join(OptionalHolidaySelection, OptionalHolidaySelection.holiday_id == Holiday.id)
            .where(
                OptionalHolidaySelection.employee_id == employee_id,
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


def hours_to_days(db: Session, hours: Decimal) -> Decimal:
    per_day = Decimal(str(settings_service.get(db, "work_hours_per_day")))
    return (Decimal(hours) / per_day).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
