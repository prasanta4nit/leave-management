from datetime import date, timedelta

from app.database import SessionLocal
from app.models import Employee

from .conftest import ADMIN, EMPLOYEE, HR, MANAGER
from .test_workflow import future_monday, leave_type_id


def test_employee_dashboard_has_desk_widgets(client):
    d = client.get("/api/dashboard/employee", headers=EMPLOYEE).json()
    assert d["today"]["kind"] in {"WORKING", "WEEKEND", "HOLIDAY", "ON_LEAVE", "WFH"}
    assert d["holiday_calendar"]["country_code"] == "IN"
    kinds = {c["kind"] for c in d["celebrations"]}
    assert kinds <= {"BIRTHDAY", "ANNIVERSARY"} and d["celebrations"]
    # Birthdays expose day/month of the next occurrence only - never the year of birth
    for c in d["celebrations"]:
        assert date.fromisoformat(c["date"]) >= date.today()
        assert "date_of_birth" not in c["employee"]


def test_celebrations_can_be_turned_off(client):
    client.put("/api/admin/settings", json={"values": {"show_celebrations": False}}, headers=ADMIN)
    assert client.get("/api/dashboard/employee", headers=EMPLOYEE).json()["celebrations"] == []


def test_anniversary_years(client):
    db = SessionLocal()
    try:
        e = db.query(Employee).filter_by(email="rohan.das@acme.example").one()
        e.joining_date = date.today().replace(year=date.today().year - 3) + timedelta(days=2)
        db.commit()
    finally:
        db.close()
    items = client.get("/api/dashboard/employee", headers=EMPLOYEE).json()["celebrations"]
    rohan = [c for c in items if c["kind"] == "ANNIVERSARY" and c["employee"]["full_name"] == "Rohan Das"]
    assert rohan and rohan[0]["years"] == 3


def test_notifications_awaiting_and_updates(client):
    lt = leave_type_id(client, "CASUAL")
    d = future_monday(9).isoformat()
    leave = client.post("/api/leaves", json={"leave_type_id": lt, "start_date": d, "end_date": d}, headers=EMPLOYEE).json()
    n = client.get("/api/dashboard/notifications", headers=MANAGER).json()
    assert any(a["id"] == leave["id"] for a in n["awaiting"]) and n["awaiting_count"] >= 1
    client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=MANAGER)
    mine = client.get("/api/dashboard/notifications", headers=EMPLOYEE).json()
    assert mine["updates"][0]["id"] == leave["id"] and mine["updates"][0]["status"] == "APPROVED"
    assert mine["awaiting_count"] == 0


def test_admin_leave_by_type_is_per_type_not_per_name(client):
    rows = client.get("/api/dashboard/admin", headers=HR).json()["leave_by_type"]
    annual = [r for r in rows if r["name"] == "Annual Leave"]
    assert {r["code"] for r in annual} == {"ANNUAL", "ANNUAL_IL", "ANNUAL_UA"}
    assert all(r["country_codes"] for r in annual)
    # Each country's figure is its own - they must not all be the same combined total
    assert len({r["days"] for r in annual}) > 1
