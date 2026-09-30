import pytest
from sqlalchemy import create_engine, inspect, text

from app.db_upgrade import upgrade_schema
from app.services import notifications

from .conftest import EMPLOYEE, HR, MANAGER, REASON
from .test_workflow import future_monday, leave_type_id


@pytest.fixture
def sent(monkeypatch):
    outbox: list[notifications.Email] = []
    monkeypatch.setattr(notifications, "send", lambda emails: outbox.extend(emails))
    return outbox


def body(client, weeks=10, **extra):
    d = future_monday(weeks).isoformat()
    return {"leave_type_id": leave_type_id(client, "CASUAL"), "start_date": d, "end_date": d, "reason": REASON, **extra}


def test_reason_is_required_and_at_least_30_characters(client):
    b = body(client)
    missing = client.post("/api/leaves", json={k: v for k, v in b.items() if k != "reason"}, headers=EMPLOYEE)
    assert missing.status_code == 422
    short = client.post("/api/leaves", json={**b, "reason": "   Doctor visit   "}, headers=EMPLOYEE)
    assert short.status_code == 422 and "at least 30 characters" in short.text and "(12 so far)" in short.text
    ok = client.post("/api/leaves", json={**b, "reason": "  " + "x" * 30 + "  "}, headers=EMPLOYEE)
    assert ok.status_code == 201 and ok.json()["reason"] == "x" * 30  # trimmed, exactly 30 is enough


def test_preview_does_not_need_a_reason(client):
    b = body(client)
    b.pop("reason")
    assert client.post("/api/leaves/preview", json=b, headers=EMPLOYEE).status_code == 200


def test_modify_also_requires_a_reason(client):
    leave = client.post("/api/leaves", json=body(client), headers=EMPLOYEE).json()
    r = client.put(f"/api/leaves/{leave['id']}", json={**body(client), "reason": "shorter"}, headers=EMPLOYEE)
    assert r.status_code == 422


def test_cc_is_saved_normalised_and_copied_on_application(client, sent):
    cc = ["Ananya.Iyer@acme.example", "ananya.iyer@acme.example", "rohan.das@acme.example", "kavya.menon@acme.example"]
    r = client.post("/api/leaves", json=body(client, cc_emails=cc), headers=EMPLOYEE)
    assert r.status_code == 201, r.text
    # lower-cased, de-duplicated, applicant (Rohan) dropped
    assert r.json()["cc_emails"] == ["ananya.iyer@acme.example", "kavya.menon@acme.example"]
    app_mail = sent[-1]
    assert app_mail.to == ["vikram.singh@acme.example"]
    assert app_mail.cc == ["ananya.iyer@acme.example", "kavya.menon@acme.example"]
    assert client.get(f"/api/leaves/{r.json()['id']}", headers=EMPLOYEE).json()["cc_emails"] == app_mail.cc


def test_cc_hears_about_the_decision_and_cancellation(client, sent):
    leave = client.post("/api/leaves", json=body(client, cc_emails=["ananya.iyer@acme.example"]), headers=EMPLOYEE).json()
    sent.clear()
    client.post(f"/api/approvals/leave/{leave['id']}/approve", json={}, headers=MANAGER)
    decided = [e for e in sent if e.to == ["rohan.das@acme.example"]]
    assert decided and decided[0].cc == ["ananya.iyer@acme.example"]
    sent.clear()
    client.post(f"/api/leaves/{leave['id']}/cancel", json={"reason": "plans changed"}, headers=EMPLOYEE)
    assert sum(e.cc.count("ananya.iyer@acme.example") + e.to.count("ananya.iyer@acme.example") for e in sent) == 1


def test_cc_outside_the_company_is_rejected(client):
    r = client.post("/api/leaves", json=body(client, cc_emails=["someone@gmail.com"]), headers=EMPLOYEE)
    assert r.status_code == 400 and "@acme.example" in r.json()["detail"] and "someone@gmail.com" in r.json()["detail"]
    bad = client.post("/api/leaves", json=body(client, cc_emails=["not-an-email"]), headers=EMPLOYEE)
    assert bad.status_code == 422


def test_cc_limit(client):
    many = [f"person{i}@acme.example" for i in range(11)]
    assert client.post("/api/leaves", json=body(client, cc_emails=many), headers=EMPLOYEE).status_code == 422


def test_hr_on_behalf_keeps_the_rules(client):
    rohan = client.get("/api/employees?q=rohan", headers=HR).json()[0]
    r = client.post("/api/leaves", json={**body(client), "employee_id": rohan["id"], "reason": "sick"}, headers=HR)
    assert r.status_code == 422


def test_schema_upgrade_adds_missing_column_once(tmp_path):
    # A database created by the previous release: leave_requests without cc_emails.
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE leave_requests (id INTEGER PRIMARY KEY, reason VARCHAR(1000))"))
        conn.execute(text("INSERT INTO leave_requests (id, reason) VALUES (1, 'existing row')"))
    assert upgrade_schema(eng) == ["leave_requests.cc_emails"]
    assert "cc_emails" in {c["name"] for c in inspect(eng).get_columns("leave_requests")}
    assert upgrade_schema(eng) == []  # idempotent
    with eng.connect() as conn:
        assert conn.execute(text("SELECT reason, cc_emails FROM leave_requests")).one() == ("existing row", None)
