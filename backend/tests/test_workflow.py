from datetime import date, timedelta

from app.database import SessionLocal
from app.models import Employee, LeaveType
from app.services import balances, settings_service

from .conftest import ADMIN, EMPLOYEE, HR, MANAGER, OTHER


def next_weekday(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7 or 7)


def future_monday(weeks: int = 3) -> date:
    """A future Monday whose Mon-Fri week contains no holidays (keeps day counts predictable)."""
    from app.models import Holiday

    monday = next_weekday(date.today(), 0) + timedelta(weeks=weeks)
    db = SessionLocal()
    try:
        while db.query(Holiday).filter(Holiday.date >= monday, Holiday.date <= monday + timedelta(days=4)).count():
            monday += timedelta(weeks=1)
    finally:
        db.close()
    return monday


def leave_type_id(client, code: str) -> int:
    return next(t["id"] for t in client.get("/api/leave-types", headers=HR).json() if t["code"] == code)


def test_me_and_roles(client):
    r = client.get("/api/auth/me", headers=MANAGER)
    assert r.status_code == 200
    assert r.json()["is_manager"] is True
    assert client.get("/api/auth/me", headers=EMPLOYEE).json()["is_manager"] is False
    assert client.get("/api/auth/me").status_code == 401


def test_weekend_and_holiday_excluded_from_leave_days(client):
    monday = future_monday()
    body = {
        "leave_type_id": leave_type_id(client, "CASUAL"),
        "start_date": (monday - timedelta(days=3)).isoformat(),  # Friday
        "end_date": monday.isoformat(),
        "duration_type": "FULL_DAY",
    }
    r = client.post("/api/leaves/preview", json=body, headers=EMPLOYEE)
    assert r.status_code == 200, r.text
    assert r.json()["total_days"] == 2  # Fri + Mon, weekend skipped


def test_apply_approve_flow_and_balance(client):
    lt = leave_type_id(client, "CASUAL")
    before = next(b for b in client.get("/api/leaves/my/balances", headers=EMPLOYEE).json() if b["leave_type_id"] == lt)
    start = future_monday()
    r = client.post(
        "/api/leaves",
        json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": (start + timedelta(days=1)).isoformat(), "reason": "Errands"},
        headers=EMPLOYEE,
    )
    assert r.status_code == 201, r.text
    leave = r.json()
    assert leave["status"] == "PENDING" and leave["approval_stage"] == "MANAGER"
    assert leave["current_approver"]["email"] == "vikram.singh@acme.example"

    mid = next(b for b in client.get("/api/leaves/my/balances", headers=EMPLOYEE).json() if b["leave_type_id"] == lt)
    days = leave["total_days"]
    assert mid["pending"] == before["pending"] + days
    assert mid["available"] == before["available"] - days

    # Unrelated employee cannot approve; manager sees it in pending list and approves.
    assert client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=OTHER).status_code == 403
    assert any(p["id"] == leave["id"] and p["kind"] == "LEAVE" for p in client.get("/api/approvals/pending", headers=MANAGER).json())
    r = client.post(f"/api/approvals/leave/{leave['id']}/approve", json={"comment": "ok"}, headers=MANAGER)
    assert r.status_code == 200 and r.json()["outcome"] == "APPROVED"

    after = next(b for b in client.get("/api/leaves/my/balances", headers=EMPLOYEE).json() if b["leave_type_id"] == lt)
    assert after["used"] == before["used"] + days and after["pending"] == before["pending"]

    detail = client.get(f"/api/leaves/{leave['id']}", headers=EMPLOYEE).json()
    assert [h["action"] for h in detail["history"]] == ["APPLIED", "APPROVED"]

    # Cancel a future approved leave -> balance restored
    r = client.post(f"/api/leaves/{leave['id']}/cancel", json={"reason": "Plans changed"}, headers=EMPLOYEE)
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    final = next(b for b in client.get("/api/leaves/my/balances", headers=EMPLOYEE).json() if b["leave_type_id"] == lt)
    assert final["available"] == before["available"]


def test_reject_requires_comment_and_hr_override(client):
    lt = leave_type_id(client, "CASUAL")
    start = future_monday(4)
    leave = client.post(
        "/api/leaves", json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": start.isoformat()}, headers=EMPLOYEE
    ).json()
    assert client.post(f"/api/approvals/leave/{leave['id']}/reject", json={}, headers=MANAGER).status_code == 400
    r = client.post(f"/api/approvals/leave/{leave['id']}/reject", json={"comment": "Release week"}, headers=MANAGER)
    assert r.json()["outcome"] == "REJECTED"
    # Manager cannot flip their own decision, HR can override.
    assert client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=MANAGER).status_code == 403
    r = client.post(f"/api/approvals/leave/{leave['id']}/approve", json={"comment": "Approved by HR"}, headers=HR)
    assert r.status_code == 200 and r.json()["outcome"] == "APPROVED"
    hist = client.get(f"/api/leaves/{leave['id']}", headers=HR).json()["history"]
    assert hist[-1]["action"] == "OVERRIDDEN" and hist[-1]["is_override"] is True


def test_two_level_approval(client):
    client.put("/api/admin/settings", json={"values": {"leave_approval_flow": "MANAGER_THEN_HR"}}, headers=ADMIN)
    lt = leave_type_id(client, "CASUAL")
    start = future_monday(5)
    leave = client.post(
        "/api/leaves", json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": start.isoformat()}, headers=EMPLOYEE
    ).json()
    r = client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=MANAGER)
    assert r.json()["outcome"] == "ESCALATED"
    assert r.json()["request"]["approval_stage"] == "HR"
    r = client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=HR)
    assert r.json()["outcome"] == "APPROVED"


def test_insufficient_balance_and_overlap(client):
    lt = leave_type_id(client, "CASUAL")
    start = future_monday(6)
    # Casual allows max 3 consecutive days
    r = client.post(
        "/api/leaves",
        json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": (start + timedelta(days=3)).isoformat()},
        headers=EMPLOYEE,
    )
    assert r.status_code == 400 and "consecutive" in r.json()["detail"]
    ok = client.post(
        "/api/leaves", json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": start.isoformat()}, headers=EMPLOYEE
    )
    assert ok.status_code == 201
    dup = client.post(
        "/api/leaves", json={"leave_type_id": lt, "start_date": start.isoformat(), "end_date": start.isoformat()}, headers=EMPLOYEE
    )
    assert dup.status_code == 400 and "Overlaps" in dup.json()["detail"]


def test_half_day_sessions_can_share_a_date(client):
    lt = leave_type_id(client, "CASUAL")
    d = future_monday(7).isoformat()
    base = {"leave_type_id": lt, "start_date": d, "end_date": d, "duration_type": "HALF_DAY"}
    assert client.post("/api/leaves", json={**base, "half_day_session": "FIRST_HALF"}, headers=EMPLOYEE).status_code == 201
    assert client.post("/api/leaves", json={**base, "half_day_session": "FIRST_HALF"}, headers=EMPLOYEE).status_code == 400
    r = client.post("/api/leaves", json={**base, "half_day_session": "SECOND_HALF"}, headers=EMPLOYEE)
    assert r.status_code == 201 and r.json()["total_days"] == 0.5


def test_hourly_leave_not_supported(client):
    lt = leave_type_id(client, "CASUAL")
    d = future_monday(8).isoformat()
    r = client.post(
        "/api/leaves",
        json={"leave_type_id": lt, "start_date": d, "end_date": d, "duration_type": "HOURLY"},
        headers=EMPLOYEE,
    )
    assert r.status_code == 422  # only FULL_DAY and HALF_DAY exist
    assert "allow_hourly" not in client.get("/api/leave-types", headers=EMPLOYEE).json()[0]

def test_monthly_accrual_and_proration():
    db = SessionLocal()
    try:
        annual = db.query(LeaveType).filter_by(code="ANNUAL").one()
        casual = db.query(LeaveType).filter_by(code="CASUAL").one()
        emp = db.query(Employee).filter_by(employee_code="EMP022").one()  # joined 2025-07-07
        bal = balances.ensure_balance(db, emp, annual, 2025, today=date(2026, 3, 15))
        assert float(bal.accrued) == 9.0  # Jul..Dec 2025 at 1.5/month
        emp2 = db.query(Employee).filter_by(employee_code="EMP021").one()  # joined June of seed year
        alloc = balances.initial_allocation(casual, emp2, emp2.joining_date.year)
        assert float(alloc) == 4.5  # 8 * 7/12 rounded to 0.5
        db.rollback()
    finally:
        db.close()


def test_carry_forward_capped():
    db = SessionLocal()
    try:
        annual = db.query(LeaveType).filter_by(code="ANNUAL").one()
        emp = db.query(Employee).filter_by(employee_code="EMP019").one()
        prev = balances.ensure_balance(db, emp, annual, 2020, today=date(2021, 1, 5))
        assert float(prev.accrued) == 18.0
        assert float(balances.compute_carry_forward(db, emp, annual, 2021)) == 10.0
        db.rollback()
    finally:
        db.close()


def test_wfh(client):
    d = future_monday(2)
    r = client.post("/api/wfh", json={"start_date": d.isoformat(), "end_date": (d + timedelta(days=1)).isoformat(), "reason": "Repair"}, headers=EMPLOYEE)
    assert r.status_code == 201 and r.json()["total_days"] == 2
    assert client.post(f"/api/approvals/wfh/{r.json()['id']}/approve", json={}, headers=MANAGER).json()["outcome"] == "APPROVED"
    # Overlapping WFH is rejected
    dup = client.post("/api/wfh", json={"start_date": d.isoformat(), "end_date": d.isoformat()}, headers=EMPLOYEE)
    assert dup.status_code == 400
    # Comp-off has been removed from the product
    assert client.post("/api/approvals/comp_off/1/approve", json={}, headers=MANAGER).status_code == 404


def test_optional_holiday_limit(client):
    db = SessionLocal()
    settings_service.update(db, {"max_optional_holidays": 1})
    db.commit()
    db.close()
    year = date.today().year + 1
    created = [
        client.post("/api/holidays", json={"name": name, "date": f"{year}-06-{10 + i}", "is_optional": True}, headers=HR).json()["id"]
        for i, name in enumerate(["Opt A", "Opt B"])
    ]
    assert client.post(f"/api/holidays/{created[0]}/opt-in", headers=EMPLOYEE).status_code == 200
    assert client.post(f"/api/holidays/{created[1]}/opt-in", headers=EMPLOYEE).status_code == 400


def test_visibility_rules(client):
    rohan = client.get("/api/employees?q=rohan", headers=OTHER).json()[0]
    assert "address" not in rohan  # directory hides private fields from non-HR
    assert client.get(f"/api/employees/{rohan['id']}/balances", headers=OTHER).status_code == 403
    assert client.get(f"/api/employees/{rohan['id']}/balances", headers=MANAGER).status_code == 200
    assert client.get("/api/dashboard/admin", headers=EMPLOYEE).status_code == 403
    assert client.get("/api/dashboard/admin", headers=HR).status_code == 200


def test_org_chart_and_cycle_prevention(client):
    tree = client.get("/api/employees/org-chart", headers=EMPLOYEE).json()
    assert len(tree) == 1 and tree[0]["employee_code"] == "EMP001"
    ceo_id = tree[0]["id"]
    rohan = client.get("/api/employees?q=rohan", headers=HR).json()[0]
    r = client.put(f"/api/employees/{ceo_id}", json={"manager_id": rohan["id"]}, headers=ADMIN)
    assert r.status_code == 400 and "circular" in r.json()["detail"]


def test_reports_and_exports(client):
    r = client.get("/api/reports/utilization", headers=HR)
    assert r.status_code == 200 and r.json()["rows"]
    csv = client.get("/api/reports/department?format=csv", headers=HR)
    assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
    xlsx = client.get("/api/reports/monthly?format=xlsx", headers=HR)
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"
    assert client.get("/api/reports/utilization", headers=EMPLOYEE).status_code == 403
    team = client.get("/api/reports/utilization", headers=MANAGER).json()["rows"]
    assert all(row["department"] == "Engineering" for row in team)


def test_dashboards_and_calendar(client):
    assert "balances" in client.get("/api/dashboard/employee", headers=EMPLOYEE).json()
    m = client.get("/api/dashboard/manager", headers=MANAGER).json()
    assert m["team_size"] >= 6 and m["pending_count"] >= 1
    cal = client.get("/api/calendar?scope=company", headers=EMPLOYEE).json()
    assert "holidays" in cal and "leaves" in cal


def test_scheduled_jobs(client):
    assert client.post("/api/admin/jobs/accrual", headers=ADMIN).status_code == 200
    assert client.post("/api/admin/jobs/reminders", headers=ADMIN).json()["reminders_sent"] >= 1
    assert client.post("/api/admin/jobs/accrual", headers=HR).status_code == 403
