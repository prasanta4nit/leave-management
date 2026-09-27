from datetime import timedelta

from .conftest import HR, as_user
from .test_workflow import future_monday, leave_type_id

INDIA = as_user("rohan.das@acme.example")  # IN
ISRAEL = as_user("noam.levi@acme.example")  # IL, Fri-Sat weekend
UKRAINE = as_user("oleksandr.kovalenko@acme.example")  # UA


def calendar_id(client, country: str) -> int:
    return next(c["id"] for c in client.get("/api/holiday-calendars", headers=HR).json() if c["country_code"] == country)


def preview(client, headers, day):
    # Unpaid leave applies in every country, so it isolates calendar behaviour from leave policy.
    body = {"leave_type_id": leave_type_id(client, "UNPAID"), "start_date": day.isoformat(), "end_date": day.isoformat()}
    return client.post("/api/leaves/preview", json=body, headers=headers)


def test_seeded_calendars_and_assignment(client):
    cals = {c["country_code"]: c for c in client.get("/api/holiday-calendars", headers=INDIA).json()}
    assert set(cals) == {"IN", "IL", "UA"}
    assert cals["IN"]["is_default"] and cals["IL"]["weekend_days"] == [4, 5]
    assert cals["IL"]["employee_count"] == 2 and cals["UA"]["employee_count"] == 3
    assert client.get("/api/auth/me", headers=ISRAEL).json()["holiday_calendar"]["country_code"] == "IL"
    assert client.get("/api/auth/me", headers=ISRAEL).json()["settings"]["weekend_days"] == [4, 5]


def test_country_specific_weekends(client):
    friday = future_monday() + timedelta(days=4)
    sunday = friday + timedelta(days=2)
    assert preview(client, INDIA, friday).json()["total_days"] == 1
    assert preview(client, ISRAEL, friday).status_code == 400  # Friday is weekend in Israel
    assert preview(client, ISRAEL, sunday).json()["total_days"] == 1  # Sunday is a working day in Israel
    assert preview(client, INDIA, sunday).status_code == 400
    # Thu -> Mon: India counts Thu, Fri, Mon; Israel counts Thu, Sun, Mon
    body = {
        "leave_type_id": leave_type_id(client, "UNPAID"),
        "start_date": (friday - timedelta(days=1)).isoformat(),
        "end_date": (sunday + timedelta(days=1)).isoformat(),
    }
    il = client.post("/api/leaves/preview", json=body, headers=ISRAEL).json()
    assert il["total_days"] == 3
    assert {n["reason"] for n in il["non_working"]} == {"Weekend"}


def test_holidays_only_apply_to_their_calendar(client):
    tuesday = future_monday() + timedelta(days=1)
    r = client.post(
        "/api/holidays",
        json={"calendar_id": calendar_id(client, "IL"), "name": "Company Day IL", "date": tuesday.isoformat()},
        headers=HR,
    )
    assert r.status_code == 201 and r.json()["country_code"] == "IL"
    assert preview(client, ISRAEL, tuesday).status_code == 400
    assert preview(client, INDIA, tuesday).json()["total_days"] == 1
    assert preview(client, UKRAINE, tuesday).json()["total_days"] == 1
    # Each employee's holiday list defaults to their own calendar
    year = tuesday.year
    il_names = {h["name"] for h in client.get(f"/api/holidays?year={year}", headers=ISRAEL).json()}
    in_names = {h["name"] for h in client.get(f"/api/holidays?year={year}", headers=INDIA).json()}
    assert "Company Day IL" in il_names and "Company Day IL" not in in_names


def test_calendar_follows_country_and_override(client):
    ua = calendar_id(client, "UA")
    india = calendar_id(client, "IN")
    r = client.post(
        "/api/employees",
        json={"first_name": "Olena", "last_name": "Tkachenko", "email": "olena@acme.example", "joining_date": "2026-01-05",
              "country_code": "ua", "send_invite": False},
        headers=HR,
    )
    assert r.status_code == 201, r.text
    emp_id = r.json()["id"]
    assert r.json()["country_code"] == "UA"
    assert client.get(f"/api/employees/{emp_id}", headers=HR).json()["holiday_calendar"]["id"] == ua
    client.put(f"/api/employees/{emp_id}", json={"holiday_calendar_id": india}, headers=HR)
    assert client.get(f"/api/employees/{emp_id}", headers=HR).json()["holiday_calendar"]["id"] == india
    # Moving country without an override switches calendars automatically
    client.put(f"/api/employees/{emp_id}", json={"holiday_calendar_id": None, "country_code": "IL"}, headers=HR)
    assert client.get(f"/api/employees/{emp_id}", headers=HR).json()["holiday_calendar"]["country_code"] == "IL"
    assert client.put(f"/api/employees/{emp_id}", json={"country_code": "India"}, headers=HR).status_code == 422
    assert len(client.get("/api/employees?country_code=UA", headers=HR).json()) == 3  # Olena moved to IL above


def test_cannot_opt_into_another_countrys_optional_holiday(client):
    tuesday = future_monday() + timedelta(days=1)
    h = client.post(
        "/api/holidays",
        json={"calendar_id": calendar_id(client, "IL"), "name": "Optional IL", "date": tuesday.isoformat(), "is_optional": True},
        headers=HR,
    ).json()
    assert client.post(f"/api/holidays/{h['id']}/opt-in", headers=INDIA).status_code == 400
    assert client.post(f"/api/holidays/{h['id']}/opt-in", headers=ISRAEL).status_code == 200
    assert preview(client, ISRAEL, tuesday).status_code == 400  # opted-in optional holiday is now a day off


def test_team_calendar_shows_each_countrys_holidays(client):
    data = client.get("/api/calendar?scope=company&start=2026-04-01&end=2026-04-30", headers=HR).json()
    by_country = {h["country_code"] for h in data["holidays"]}
    assert {"IN", "IL", "UA"} <= by_country
    pesach = next(h for h in data["holidays"] if h["name"].startswith("Passover (Pesach) - first"))
    assert pesach["members_affected"] == 2
    assert {c["country_code"] for c in data["calendars"]} == {"IN", "IL", "UA"}


def test_calendar_admin_rules(client):
    r = client.post("/api/holiday-calendars", json={"name": "UAE", "country_code": "AE", "weekend_days": [5, 6]}, headers=HR)
    assert r.status_code == 201
    new_id = r.json()["id"]
    assert client.post("/api/holiday-calendars", json={"name": "Bad", "weekend_days": [9]}, headers=HR).status_code == 422
    assert client.post("/api/holiday-calendars", json={"name": "X"}, headers=INDIA).status_code == 403
    # Default calendar can't be deleted; a calendar in use can't be deleted
    assert client.delete(f"/api/holiday-calendars/{calendar_id(client, 'IN')}", headers=HR).status_code == 400
    assert client.delete(f"/api/holiday-calendars/{calendar_id(client, 'IL')}", headers=HR).status_code == 400
    # Switching the default moves the flag
    client.put(f"/api/holiday-calendars/{new_id}", json={"name": "UAE", "country_code": "AE", "weekend_days": [5, 6], "is_default": True}, headers=HR)
    defaults = [c["country_code"] for c in client.get("/api/holiday-calendars", headers=HR).json() if c["is_default"]]
    assert defaults == ["AE"]
    assert client.delete(f"/api/holiday-calendars/{calendar_id(client, 'IN')}", headers=HR).status_code == 400  # still in use
