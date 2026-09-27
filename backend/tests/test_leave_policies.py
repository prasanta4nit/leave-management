from datetime import timedelta

from app.database import SessionLocal
from app.models import Employee, LeaveBalance, LeaveType

from .conftest import ADMIN, HR, as_user
from .test_workflow import future_monday, leave_type_id

INDIA = as_user("rohan.das@acme.example")
ISRAEL = as_user("noam.levi@acme.example")
UKRAINE = as_user("oleksandr.kovalenko@acme.example")


def me_id(client, headers) -> int:
    return client.get("/api/auth/me", headers=headers).json()["id"]


def codes(rows, key="code") -> set[str]:
    return {r[key] for r in rows}


def test_each_country_sees_its_own_leave_types(client):
    for headers, expected in [
        (INDIA, {"ANNUAL", "CASUAL", "SICK", "UNPAID"}),
        (ISRAEL, {"ANNUAL_IL", "SICK_IL", "RESERVE_IL", "UNPAID"}),
        (UKRAINE, {"ANNUAL_UA", "SICK_UA", "UNPAID"}),
    ]:
        types = client.get(f"/api/leave-types?employee_id={me_id(client, headers)}", headers=headers).json()
        assert codes(types) == expected
        assert codes(client.get("/api/leaves/my/balances", headers=headers).json(), "leave_type_code") == expected
    # Without a filter, admins see every policy
    assert len(client.get("/api/leave-types", headers=HR).json()) == 9
    assert codes(client.get("/api/leave-types?country_code=il", headers=HR).json()) == {"ANNUAL_IL", "SICK_IL", "RESERVE_IL", "UNPAID"}


def test_same_leave_name_different_rules_per_country(client):
    annual = {b["leave_type_code"]: b for h in (INDIA, ISRAEL, UKRAINE) for b in client.get("/api/leaves/my/balances", headers=h).json()
              if b["leave_type_name"] == "Annual Leave"}
    assert {k: v["annual_quota"] for k, v in annual.items()} == {"ANNUAL": 18, "ANNUAL_IL": 12, "ANNUAL_UA": 20}


def test_cannot_apply_for_another_countrys_leave_type(client):
    day = (future_monday() + timedelta(days=1)).isoformat()
    body = {"leave_type_id": leave_type_id(client, "CASUAL"), "start_date": day, "end_date": day}
    r = client.post("/api/leaves", json=body, headers=ISRAEL)
    assert r.status_code == 400 and "not available" in r.json()["detail"]
    # HR applying on the employee's behalf is held to the same policy
    r = client.post("/api/leaves", json={**body, "employee_id": me_id(client, ISRAEL)}, headers=HR)
    assert r.status_code == 400
    # The Israeli policy works
    r = client.post("/api/leaves", json={**body, "leave_type_id": leave_type_id(client, "RESERVE_IL")}, headers=ISRAEL)
    assert r.status_code == 201, r.text


def test_moving_country_switches_policy_but_keeps_history(client):
    rohan = me_id(client, INDIA)
    client.put(f"/api/employees/{rohan}", json={"country_code": "IL"}, headers=HR)
    rows = {b["leave_type_code"]: b for b in client.get("/api/leaves/my/balances", headers=INDIA).json()}
    assert rows["ANNUAL_IL"]["applicable"] is True
    # Casual leave he already took in India still shows, but is no longer part of his policy
    assert rows["CASUAL"]["applicable"] is False and rows["CASUAL"]["used"] > 0
    assert "SICK" not in rows  # unused India-only type disappears


def test_leave_type_country_validation(client):
    body = {"code": "BEREAVE", "name": "Bereavement", "annual_quota": 3, "country_codes": ["il", "UA", "il"]}
    r = client.post("/api/leave-types", json=body, headers=HR)
    assert r.status_code == 201 and r.json()["country_codes"] == ["IL", "UA"]
    assert client.post("/api/leave-types", json={**body, "code": "X1", "country_codes": ["ISR"]}, headers=HR).status_code == 422
    assert "BEREAVE" in codes(client.get(f"/api/leave-types?employee_id={me_id(client, UKRAINE)}", headers=UKRAINE).json())
    assert "BEREAVE" not in codes(client.get(f"/api/leave-types?employee_id={me_id(client, INDIA)}", headers=INDIA).json())


def test_accrual_only_creates_applicable_balances(client):
    assert client.post("/api/admin/jobs/accrual", headers=ADMIN).status_code == 200
    db = SessionLocal()
    try:
        noam = db.query(Employee).filter_by(email="noam.levi@acme.example").one()
        casual = db.query(LeaveType).filter_by(code="CASUAL").one()
        annual_il = db.query(LeaveType).filter_by(code="ANNUAL_IL").one()
        assert db.query(LeaveBalance).filter_by(employee_id=noam.id, leave_type_id=casual.id).count() == 0
        assert db.query(LeaveBalance).filter_by(employee_id=noam.id, leave_type_id=annual_il.id).count() == 1
    finally:
        db.close()
    # Adjusting a balance for a type outside the employee's country is refused
    r = client.post(
        "/api/admin/leave-balances/adjust",
        json={"employee_id": me_id(client, ISRAEL), "leave_type_id": leave_type_id(client, "CASUAL"), "year": 2026, "delta": 1, "reason": "test"},
        headers=HR,
    )
    assert r.status_code == 400


def test_utilization_report_uses_each_employees_policy(client):
    rows = client.get("/api/reports/utilization", headers=HR).json()["rows"]
    noam_types = {r["leave_type_code"] for r in rows if r["employee"] == "Noam Levi"}
    assert noam_types == {"ANNUAL_IL", "SICK_IL", "RESERVE_IL", "UNPAID"}
