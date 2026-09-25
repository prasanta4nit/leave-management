import json
from typing import Any

from sqlalchemy.orm import Session

from ..models import SystemSetting

# Approval flows:
#   MANAGER          -> reporting manager approves (falls back to HR when no manager)
#   MANAGER_THEN_HR  -> manager approves, then HR gives final approval
#   HR               -> HR/Admin approves directly
DEFAULTS: dict[str, Any] = {
    "company_name": "Acme Technologies",
    "timezone": "Asia/Kolkata",
    "work_hours_per_day": 8,
    "weekend_days": [5, 6],  # Python weekday(): Mon=0 ... Sat=5, Sun=6
    "leave_approval_flow": "MANAGER",
    "wfh_approval_flow": "MANAGER",
    "auto_approve_when_no_approver": False,
    "reminder_after_hours": 24,
    "max_optional_holidays": 2,
    "max_wfh_days_per_month": 8,
    "notify_hr_on_leave": False,
}


def get_all(db: Session) -> dict[str, Any]:
    values = dict(DEFAULTS)
    for row in db.query(SystemSetting).all():
        try:
            values[row.key] = json.loads(row.value)
        except json.JSONDecodeError:
            values[row.key] = row.value
    return values


def get(db: Session, key: str) -> Any:
    row = db.get(SystemSetting, key)
    if row is None:
        return DEFAULTS.get(key)
    return json.loads(row.value)


def update(db: Session, changes: dict[str, Any]) -> dict[str, Any]:
    for key, value in changes.items():
        if key not in DEFAULTS:
            raise ValueError(f"Unknown setting: {key}")
        row = db.get(SystemSetting, key)
        encoded = json.dumps(value)
        if row is None:
            db.add(SystemSetting(key=key, value=encoded))
        else:
            row.value = encoded
    db.flush()
    return get_all(db)
