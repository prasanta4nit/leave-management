"""Seed demo data for a ~22 person company. Usage: python -m app.seed [--reset]

Holiday dates are sample data — replace them with your company's official calendar.
"""

import sys
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .db_init import create_all
from .models import (
    Department,
    Designation,
    Employee,
    Holiday,
    LeaveRequest,
    LeaveType,
    RequestHistory,
    WfhRequest,
    utcnow,
)
from .services import balances, workdays

DEPARTMENTS = [
    ("Management", "MGMT"),
    ("Human Resources", "HR"),
    ("Engineering", "ENG"),
    ("Quality Assurance", "QA"),
    ("Product & Design", "PROD"),
    ("Sales & Marketing", "SALES"),
    ("Finance", "FIN"),
]

DESIGNATIONS = [
    ("Chief Executive Officer", 10),
    ("Engineering Manager", 8),
    ("HR Manager", 7),
    ("Product Manager", 7),
    ("Sales Manager", 7),
    ("Finance Manager", 7),
    ("Tech Lead", 6),
    ("QA Lead", 6),
    ("Senior Software Engineer", 5),
    ("Software Engineer", 4),
    ("QA Engineer", 4),
    ("UI/UX Designer", 4),
    ("Marketing Specialist", 4),
    ("Sales Executive", 3),
    ("HR Executive", 3),
    ("Accountant", 3),
    ("Intern", 1),
]

# code, first, last, designation, department, manager code, role, joining, type, gender
EMPLOYEES = [
    ("EMP001", "Arjun", "Mehta", "Chief Executive Officer", "MGMT", None, "ADMIN", "2018-04-02", "FULL_TIME", "Male"),
    ("EMP002", "Priya", "Sharma", "HR Manager", "HR", "EMP001", "HR", "2019-01-14", "FULL_TIME", "Female"),
    ("EMP003", "Neha", "Gupta", "HR Executive", "HR", "EMP002", "HR", "2023-07-03", "FULL_TIME", "Female"),
    ("EMP004", "Rahul", "Verma", "Engineering Manager", "ENG", "EMP001", "EMPLOYEE", "2018-09-10", "FULL_TIME", "Male"),
    ("EMP005", "Vikram", "Singh", "Tech Lead", "ENG", "EMP004", "EMPLOYEE", "2020-02-17", "FULL_TIME", "Male"),
    ("EMP006", "Ananya", "Iyer", "Senior Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2021-05-24", "FULL_TIME", "Female"),
    ("EMP007", "Karthik", "Reddy", "Senior Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2021-11-08", "FULL_TIME", "Male"),
    ("EMP008", "Rohan", "Das", "Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2023-03-06", "FULL_TIME", "Male"),
    ("EMP009", "Sneha", "Patel", "Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2024-01-15", "FULL_TIME", "Female"),
    ("EMP010", "Aditya", "Kumar", "Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2026-03-02", "FULL_TIME", "Male"),
    ("EMP011", "Meera", "Nair", "QA Lead", "QA", "EMP004", "EMPLOYEE", "2020-08-03", "FULL_TIME", "Female"),
    ("EMP012", "Siddharth", "Jain", "QA Engineer", "QA", "EMP011", "EMPLOYEE", "2022-06-20", "FULL_TIME", "Male"),
    ("EMP013", "Kavya", "Menon", "Product Manager", "PROD", "EMP001", "EMPLOYEE", "2019-10-01", "FULL_TIME", "Female"),
    ("EMP014", "Ishaan", "Malhotra", "UI/UX Designer", "PROD", "EMP013", "EMPLOYEE", "2022-09-12", "FULL_TIME", "Male"),
    ("EMP015", "Riya", "Bose", "Marketing Specialist", "SALES", "EMP016", "EMPLOYEE", "2023-02-01", "FULL_TIME", "Female"),
    ("EMP016", "Deepak", "Joshi", "Sales Manager", "SALES", "EMP001", "EMPLOYEE", "2019-06-17", "FULL_TIME", "Male"),
    ("EMP017", "Pooja", "Rao", "Sales Executive", "SALES", "EMP016", "EMPLOYEE", "2022-04-11", "FULL_TIME", "Female"),
    ("EMP018", "Amit", "Chauhan", "Sales Executive", "SALES", "EMP016", "EMPLOYEE", "2024-08-19", "FULL_TIME", "Male"),
    ("EMP019", "Sanjay", "Kapoor", "Finance Manager", "FIN", "EMP001", "EMPLOYEE", "2018-12-03", "FULL_TIME", "Male"),
    ("EMP020", "Divya", "Pillai", "Accountant", "FIN", "EMP019", "EMPLOYEE", "2021-03-15", "FULL_TIME", "Female"),
    ("EMP021", "Tanvi", "Shah", "Intern", "ENG", "EMP005", "EMPLOYEE", "2026-06-01", "INTERN", "Female"),
    ("EMP022", "Farhan", "Qureshi", "Software Engineer", "ENG", "EMP005", "EMPLOYEE", "2025-07-07", "CONTRACT", "Male"),
]

LEAVE_TYPES = [
    dict(code="ANNUAL", name="Annual Leave", color="#6366f1", annual_quota=18, accrual_frequency="MONTHLY",
         carry_forward_enabled=True, max_carry_forward=10, allow_half_day=True, min_notice_days=3, sort_order=1,
         description="Planned vacation. Accrues 1.5 days per month; up to 10 days carry forward."),
    dict(code="CASUAL", name="Casual Leave", color="#f59e0b", annual_quota=8, accrual_frequency="YEARLY",
         allow_half_day=True, allow_hourly=True, max_consecutive_days=3, sort_order=2,
         description="Short personal errands. Max 3 consecutive days."),
    dict(code="SICK", name="Sick Leave", color="#ef4444", annual_quota=10, accrual_frequency="YEARLY",
         allow_half_day=True, allow_hourly=True, allow_backdated=True, sort_order=3,
         description="Illness or medical appointments. Can be applied retrospectively."),
    dict(code="UNPAID", name="Unpaid Leave", color="#64748b", annual_quota=0, is_paid=False, is_unlimited=True,
         allow_half_day=True, sort_order=5, description="Leave without pay once paid balances are exhausted."),
]

HOLIDAYS = [
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
]


def _workday(db, d: date, direction: int = 1) -> date:
    while not workdays.working_dates(db, d, d):
        d += timedelta(days=direction)
    return d


def seed(reset: bool = False) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    create_all()
    db = SessionLocal()
    try:
        if db.scalar(select(Employee).limit(1)):
            print("Database already has data; use --reset to recreate.")
            return

        depts = {code: Department(name=name, code=code) for name, code in DEPARTMENTS}
        desigs = {name: Designation(name=name, level=level) for name, level in DESIGNATIONS}
        db.add_all([*depts.values(), *desigs.values()])
        db.flush()

        emps: dict[str, Employee] = {}
        for code, first, last, desig, dept, _mgr, role, joined, etype, gender in EMPLOYEES:
            e = Employee(
                employee_code=code,
                first_name=first,
                last_name=last,
                email=f"{first.lower()}.{last.lower()}@acme.example",
                phone=f"+91 98{int(code[3:]):02d} 55 {1000 + int(code[3:]) * 37}",
                designation_id=desigs[desig].id,
                department_id=depts[dept].id,
                role=role,
                employment_type=etype,
                joining_date=date.fromisoformat(joined),
                gender=gender,
                location="Bengaluru" if int(code[3:]) % 3 else "Pune",
            )
            db.add(e)
            emps[code] = e
        db.flush()
        for code, *_rest in EMPLOYEES:
            mgr = _rest[4]
            if mgr:
                emps[code].manager_id = emps[mgr].id
        for dept_code, head in {"MGMT": "EMP001", "HR": "EMP002", "ENG": "EMP004", "QA": "EMP011",
                                "PROD": "EMP013", "SALES": "EMP016", "FIN": "EMP019"}.items():
            depts[dept_code].head_id = emps[head].id

        types = {t["code"]: LeaveType(**t) for t in LEAVE_TYPES}
        db.add_all(types.values())
        db.add_all([Holiday(name=n, date=date.fromisoformat(d), is_optional=o) for n, d, o in HOLIDAYS])
        db.flush()
        db.refresh(emps["EMP001"])

        today = date.today()
        for e in emps.values():
            for lt in types.values():
                balances.ensure_balance(db, e, lt, today.year, today)

        def add_leave(code, type_code, start, days=1, status="APPROVED", duration="FULL_DAY", session=None,
                      hours=None, reason=None, applied_days_before=5):
            emp = emps[code]
            start = _workday(db, start)
            end = start
            if duration == "FULL_DAY":
                n = 1
                while n < days:
                    end = _workday(db, end + timedelta(days=1))
                    n += 1
                total = Decimal(len(workdays.working_dates(db, start, end, emp.id)))
            elif duration == "HALF_DAY":
                total = Decimal("0.5")
            else:
                total = workdays.hours_to_days(db, Decimal(hours))
            mgr = db.get(Employee, emp.manager_id) if emp.manager_id else emps["EMP002"]
            applied = utcnow() - timedelta(days=applied_days_before)
            r = LeaveRequest(employee_id=emp.id, leave_type_id=types[type_code].id, start_date=start, end_date=end,
                             duration_type=duration, half_day_session=session, hours=hours, total_days=total,
                             reason=reason, status=status, applied_at=applied)
            if status == "PENDING":
                r.approval_stage = "MANAGER"
                r.current_approver_id = mgr.id
            else:
                r.decided_by_id = mgr.id
                r.decided_at = applied + timedelta(hours=6)
                r.decision_comment = "Enjoy!" if status == "APPROVED" else "Critical release that week, please reschedule."
            db.add(r)
            db.flush()
            db.add(RequestHistory(request_kind="LEAVE", request_id=r.id, action="APPLIED", actor_id=emp.id,
                                  to_status="PENDING", created_at=applied))
            if status != "PENDING":
                db.add(RequestHistory(request_kind="LEAVE", request_id=r.id, action=status, actor_id=mgr.id,
                                      from_status="PENDING", to_status=status, comment=r.decision_comment,
                                      created_at=r.decided_at))

        y0 = date(today.year, 1, 1)
        add_leave("EMP006", "ANNUAL", y0 + timedelta(days=40), 3, reason="Family trip to Goa")
        add_leave("EMP007", "SICK", y0 + timedelta(days=75), 2, reason="Viral fever")
        add_leave("EMP008", "CASUAL", y0 + timedelta(days=120), 1, reason="Bank work")
        add_leave("EMP009", "ANNUAL", y0 + timedelta(days=150), 5, reason="Sister's wedding")
        add_leave("EMP012", "SICK", y0 + timedelta(days=160), 1, duration="HALF_DAY", session="FIRST_HALF", reason="Doctor appointment")
        add_leave("EMP017", "ANNUAL", y0 + timedelta(days=200), 4, reason="Vacation")
        add_leave("EMP014", "CASUAL", y0 + timedelta(days=210), 1, duration="HOURLY", hours=Decimal(3), reason="Passport verification")
        add_leave("EMP020", "ANNUAL", y0 + timedelta(days=220), 2, status="REJECTED", reason="Short break")
        add_leave("EMP005", "ANNUAL", y0 + timedelta(days=230), 3, reason="Trek")
        add_leave("EMP011", "SICK", today - timedelta(days=12), 1, reason="Migraine")
        add_leave("EMP015", "ANNUAL", today, 1, reason="Personal")
        add_leave("EMP008", "ANNUAL", today + timedelta(days=10), 3, status="PENDING", reason="Hometown visit", applied_days_before=2)
        add_leave("EMP009", "CASUAL", today + timedelta(days=4), 1, status="PENDING", reason="House shifting", applied_days_before=1)
        add_leave("EMP012", "ANNUAL", today + timedelta(days=20), 5, status="PENDING", reason="Diwali with family")
        add_leave("EMP018", "CASUAL", today + timedelta(days=3), 1, duration="HALF_DAY", session="SECOND_HALF", status="PENDING", reason="Parent-teacher meeting", applied_days_before=0)
        add_leave("EMP006", "ANNUAL", today + timedelta(days=30), 2, reason="Long weekend")
        add_leave("EMP020", "SICK", today + timedelta(days=1), 1, status="PENDING", reason="Dental procedure", applied_days_before=1)

        def wfh(code, start, days, status):
            emp = emps[code]
            start = _workday(db, start)
            end = start
            for _ in range(days - 1):
                end = _workday(db, end + timedelta(days=1))
            w = WfhRequest(employee_id=emp.id, start_date=start, end_date=end, reason="Internet installation at new flat" if status == "PENDING" else "Plumbing work at home",
                           total_days=len(workdays.working_dates(db, start, end, emp.id)), status=status)
            if status == "PENDING":
                w.approval_stage = "MANAGER"
                w.current_approver_id = emp.manager_id
            else:
                w.decided_by_id = emp.manager_id
                w.decided_at = utcnow()
            db.add(w)
            db.flush()
            db.add(RequestHistory(request_kind="WFH", request_id=w.id, action="APPLIED", actor_id=emp.id, to_status="PENDING"))

        wfh("EMP007", today, 1, "APPROVED")
        wfh("EMP014", today + timedelta(days=2), 2, "PENDING")
        wfh("EMP010", today + timedelta(days=6), 1, "PENDING")

        db.commit()
        print(f"Seeded {len(emps)} employees, {len(types)} leave types, {len(HOLIDAYS)} holidays.")
        print("Admin: arjun.mehta@acme.example | HR: priya.sharma@acme.example | Manager: vikram.singh@acme.example")
    finally:
        db.close()


if __name__ == "__main__":
    seed(reset="--reset" in sys.argv)
