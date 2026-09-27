"""Resolve which holiday calendar (and weekend) applies to an employee.

Order: the employee's explicit calendar -> the calendar for their country -> the default calendar.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Employee, HolidayCalendar
from . import settings_service


def default_calendar(db: Session) -> HolidayCalendar | None:
    return db.scalar(select(HolidayCalendar).order_by(HolidayCalendar.is_default.desc(), HolidayCalendar.id).limit(1))


def calendar_for_country(db: Session, country_code: str | None) -> HolidayCalendar | None:
    if not country_code:
        return None
    return db.scalar(
        select(HolidayCalendar)
        .where(HolidayCalendar.country_code == country_code.upper())
        .order_by(HolidayCalendar.is_default.desc(), HolidayCalendar.id)
        .limit(1)
    )


def calendar_for(db: Session, employee: Employee | None) -> HolidayCalendar | None:
    if employee is not None:
        if employee.holiday_calendar_id:
            cal = db.get(HolidayCalendar, employee.holiday_calendar_id)
            if cal:
                return cal
        cal = calendar_for_country(db, employee.country_code)
        if cal:
            return cal
    return default_calendar(db)


def employee_country(db: Session, employee: Employee) -> str | None:
    """Country used for country-specific leave policies."""
    if employee.country_code:
        return employee.country_code.upper()
    cal = calendar_for(db, employee)
    return cal.country_code if cal else None


def weekend_days(db: Session, calendar: HolidayCalendar | None) -> list[int]:
    if calendar is not None and calendar.weekend_days is not None:
        return list(calendar.weekend_days)
    return list(settings_service.get(db, "weekend_days"))


def effective_map(db: Session, employees: list[Employee]) -> dict[int, HolidayCalendar | None]:
    """Employee id -> calendar, resolved with a single calendar query."""
    calendars = list(db.scalars(select(HolidayCalendar).order_by(HolidayCalendar.is_default.desc(), HolidayCalendar.id)))
    by_id = {c.id: c for c in calendars}
    by_country: dict[str, HolidayCalendar] = {}
    for c in calendars:
        if c.country_code and c.country_code not in by_country:
            by_country[c.country_code] = c
    fallback = calendars[0] if calendars else None
    result = {}
    for e in employees:
        cal = by_id.get(e.holiday_calendar_id) if e.holiday_calendar_id else None
        cal = cal or by_country.get((e.country_code or "").upper()) or fallback
        result[e.id] = cal
    return result


def brief(calendar: HolidayCalendar | None) -> dict | None:
    if calendar is None:
        return None
    return {"id": calendar.id, "name": calendar.name, "country_code": calendar.country_code}
