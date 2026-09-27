"""Starter holiday calendars for India, Israel and Ukraine.

IMPORTANT: these are starting points, not an authoritative source. Several holidays follow lunar /
Hebrew / Orthodox calendars and some companies observe different sets - verify every date with
HR / local counsel each year and edit them in the app (Holidays page).

Notes
- Israel: weekend is Friday-Saturday. Jewish holidays begin at sundown the previous evening; the
  listed date is the day off. Holiday eves (Erev Pesach, Erev Rosh Hashana, ...) are often half days -
  add them as optional holidays or apply half-day leave as per company policy.
- Ukraine: under martial law (since 24 Feb 2022) public holidays are NOT statutory days off
  (Law No. 2136-IX). Many companies still grant some of them; keep or remove to match your policy.
"""

# name, country, weekend days (Python weekday: Mon=0 .. Sun=6), default?
CALENDARS = [
    {"name": "India", "country_code": "IN", "weekend_days": [5, 6], "is_default": True,
     "description": "India office holidays (Sat-Sun weekend)"},
    {"name": "Israel", "country_code": "IL", "weekend_days": [4, 5], "is_default": False,
     "description": "Israel holidays (Fri-Sat weekend)"},
    {"name": "Ukraine", "country_code": "UA", "weekend_days": [5, 6], "is_default": False,
     "description": "Ukraine holidays (Sat-Sun weekend). See note on martial law."},
]

# country -> [(name, ISO date, optional?)]
HOLIDAYS: dict[str, list[tuple[str, str, bool]]] = {
    "IN": [
        ("New Year's Day", "2026-01-01", False),
        ("Makar Sankranti / Pongal", "2026-01-14", True),
        ("Republic Day", "2026-01-26", False),
        ("Holi", "2026-03-04", False),
        ("Eid al-Fitr", "2026-03-20", True),
        ("Good Friday", "2026-04-03", False),
        ("Labour Day", "2026-05-01", False),
        ("Eid al-Adha", "2026-05-27", True),
        ("Independence Day", "2026-08-15", False),
        ("Raksha Bandhan", "2026-08-28", True),
        ("Gandhi Jayanti", "2026-10-02", False),
        ("Dussehra", "2026-10-20", False),
        ("Diwali", "2026-11-09", False),
        ("Guru Nanak Jayanti", "2026-11-24", True),
        ("Christmas Day", "2026-12-25", False),
        ("New Year's Day", "2027-01-01", False),
        ("Republic Day", "2027-01-26", False),
    ],
    "IL": [
        ("Purim", "2026-03-03", True),
        ("Passover (Pesach) - first day", "2026-04-02", False),
        ("Passover (Pesach) - seventh day", "2026-04-08", False),
        ("Yom HaZikaron (Memorial Day)", "2026-04-21", True),
        ("Independence Day (Yom Ha'atzmaut)", "2026-04-22", False),
        ("Shavuot", "2026-05-22", False),
        ("Rosh Hashana - day 1", "2026-09-12", False),
        ("Rosh Hashana - day 2", "2026-09-13", False),
        ("Yom Kippur", "2026-09-21", False),
        ("Sukkot - first day", "2026-09-26", False),
        ("Simchat Torah / Shemini Atzeret", "2026-10-03", False),
        ("Hanukkah (first day)", "2026-12-05", True),
    ],
    "UA": [
        ("New Year's Day", "2027-01-01", False),
        ("New Year's Day", "2026-01-01", False),
        ("International Women's Day", "2026-03-08", False),
        ("Easter (Orthodox)", "2026-04-12", False),
        ("Labour Day", "2026-05-01", False),
        ("Day of Remembrance and Victory over Nazism", "2026-05-08", False),
        ("Trinity Sunday (Orthodox)", "2026-05-31", False),
        ("Constitution Day", "2026-06-28", False),
        ("Statehood Day", "2026-07-15", False),
        ("Independence Day", "2026-08-24", False),
        ("Defenders of Ukraine Day", "2026-10-01", False),
        ("Christmas Day", "2026-12-25", False),
    ],
}


def install(db, include_holidays: bool = True) -> dict[str, int]:
    """Create any missing calendars (and their holidays). Returns country -> calendar id."""
    from datetime import date

    from sqlalchemy import select

    from .models import Holiday, HolidayCalendar

    ids: dict[str, int] = {}
    for spec in CALENDARS:
        cal = db.scalar(select(HolidayCalendar).where(HolidayCalendar.country_code == spec["country_code"]))
        if cal is None:
            if spec["is_default"] and db.scalar(select(HolidayCalendar).where(HolidayCalendar.is_default.is_(True))):
                spec = {**spec, "is_default": False}
            cal = HolidayCalendar(**spec)
            db.add(cal)
            db.flush()
            if include_holidays:
                db.add_all(
                    Holiday(calendar_id=cal.id, name=n, date=date.fromisoformat(d), is_optional=o)
                    for n, d, o in HOLIDAYS.get(spec["country_code"], [])
                )
        ids[spec["country_code"]] = cal.id
    db.flush()
    return ids
