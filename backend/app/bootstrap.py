"""First-run setup for a fresh deployment (no demo data).

Invoke the Lambda with:
  {"job": "bootstrap", "admin_email": "you@company.com", "admin_first_name": "Asha", "admin_last_name": "Rao",
   "company_name": "Your Company"}

Creates tables, default leave policies, the India / Israel / Ukraine holiday calendars and the
first Admin employee (plus their Cognito login).
Safe to re-run: existing rows are left alone.
"""

from datetime import date

from sqlalchemy import select

from .database import SessionLocal
from .db_init import create_all
from .db_upgrade import upgrade_schema
from .holiday_data import install as install_calendars
from .models import Department, Designation, Employee, LeaveType
from .seed import LEAVE_TYPES
from .services import cognito, settings_service


def bootstrap(event: dict) -> dict:
    create_all()
    db = SessionLocal()
    result: dict = {"tables": "ok", "schema_upgrades": upgrade_schema()}
    try:
        if not db.scalar(select(LeaveType).limit(1)):
            db.add_all(LeaveType(**t) for t in LEAVE_TYPES)
            result["leave_types"] = len(LEAVE_TYPES)
        result["holiday_calendars"] = sorted(install_calendars(db))
        if event.get("company_name"):
            settings_service.update(db, {"company_name": event["company_name"]})

        email = (event.get("admin_email") or "").strip().lower()
        if email and not db.scalar(select(Employee).where(Employee.email == email)):
            dept = db.scalar(select(Department).where(Department.code == "MGMT")) or Department(name="Management", code="MGMT")
            desig = db.scalar(select(Designation).where(Designation.name == "Administrator")) or Designation(name="Administrator", level=10)
            db.add_all([dept, desig])
            db.flush()
            admin = Employee(
                employee_code="EMP001",
                first_name=event.get("admin_first_name") or "Admin",
                last_name=event.get("admin_last_name") or "User",
                email=email,
                role="ADMIN",
                joining_date=date.fromisoformat(event["joining_date"]) if event.get("joining_date") else date.today(),
                department_id=dept.id,
                designation_id=desig.id,
                country_code=(event.get("admin_country") or "IN").upper(),
            )
            db.add(admin)
            db.flush()
            admin.cognito_sub = cognito.create_user(admin.email, admin.first_name, admin.last_name)
            result["admin"] = email
        db.commit()
    finally:
        db.close()
    return result
