import json
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, is_manager, require_admin, require_hr
from ..config import get_settings
from ..database import get_db
from ..models import AuditLog, Employee, LeaveType
from ..schemas import BalanceAdjust, SettingsUpdate
from ..services import audit, balances, calendars, notifications, settings_service

router = APIRouter(tags=["admin"])

FLOWS = {"MANAGER", "MANAGER_THEN_HR", "HR"}


@router.get("/auth/me")
def me(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    s = settings_service.get_all(db)
    cal = calendars.calendar_for(db, user)
    return {
        **S.employee(user),
        "is_manager": is_manager(db, user),
        "is_hr": user.is_hr,
        "is_admin": user.is_admin,
        "holiday_calendar": calendars.brief(cal),
        "settings": {
            "company_name": s["company_name"],
            "weekend_days": calendars.weekend_days(db, cal),
            "max_optional_holidays": s["max_optional_holidays"],
        },
    }


@router.get("/auth/dev-users")
def dev_users(db: Session = Depends(get_db)):
    """Login picker for local development only."""
    if get_settings().auth_mode != "dev":
        raise HTTPException(404, "Not found")
    rows = db.scalars(
        select(Employee).options(selectinload(Employee.designation)).where(Employee.status == "ACTIVE").order_by(Employee.role, Employee.first_name)
    )
    return [
        {
            "id": e.id,
            "email": e.email,
            "full_name": e.full_name,
            "role": e.role,
            "designation": e.designation.name if e.designation else None,
            "country_code": e.country_code,
        }
        for e in rows
    ]


@router.get("/admin/settings")
def get_settings_values(db: Session = Depends(get_db), _: Employee = Depends(require_hr)):
    return settings_service.get_all(db)


@router.put("/admin/settings")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db), user: Employee = Depends(require_admin)):
    v = body.values
    for key in ("leave_approval_flow", "wfh_approval_flow"):
        if key in v and v[key] not in FLOWS:
            raise HTTPException(400, f"{key} must be one of {sorted(FLOWS)}")
    if "weekend_days" in v and (not isinstance(v["weekend_days"], list) or any(d not in range(7) for d in v["weekend_days"])):
        raise HTTPException(400, "weekend_days must be a list of weekday numbers 0-6")
    try:
        before = settings_service.get_all(db)
        result = settings_service.update(db, v)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    audit.log(db, user.id, "settings", None, "UPDATE", {k: {"from": before.get(k), "to": val} for k, val in v.items()})
    db.commit()
    return result


@router.get("/admin/audit-logs")
def audit_logs(
    entity: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    _: Employee = Depends(require_hr),
):
    stmt = select(AuditLog).options(selectinload(AuditLog.actor)).order_by(AuditLog.created_at.desc())
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    return [
        {
            "id": a.id,
            "actor": S.employee_brief(a.actor),
            "entity": a.entity,
            "entity_id": a.entity_id,
            "action": a.action,
            "details": json.loads(a.details) if a.details else None,
            "created_at": a.created_at,
        }
        for a in db.scalars(stmt.limit(min(limit, 1000)))
    ]


@router.post("/admin/leave-balances/adjust")
def adjust_balance(body: BalanceAdjust, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    emp = db.get(Employee, body.employee_id)
    lt = db.get(LeaveType, body.leave_type_id)
    if emp is None or lt is None:
        raise HTTPException(404, "Employee or leave type not found")
    if lt.is_unlimited:
        raise HTTPException(400, "Unlimited leave types have no balance to adjust")
    if not balances.applies_to(db, lt, emp):
        raise HTTPException(400, f"{lt.name} ({lt.code}) doesn't apply to this employee's country")
    bal = balances.ensure_balance(db, emp, lt, body.year)
    bal.adjusted = Decimal(bal.adjusted) + body.delta
    audit.log(
        db,
        user.id,
        "leave_balance",
        bal.id,
        "ADJUST",
        {"employee": emp.full_name, "leave_type": lt.code, "year": body.year, "delta": body.delta, "reason": body.reason},
    )
    db.commit()
    return balances.balance_summary(db, emp, lt, body.year)


@router.post("/admin/jobs/{job}")
def run_job(job: str, year: int | None = None, db: Session = Depends(get_db), user: Employee = Depends(require_admin)):
    result = run_named_job(db, job, year)
    audit.log(db, user.id, "job", job, "RUN", result)
    db.commit()
    return result


def run_named_job(db: Session, job: str, year: int | None = None) -> dict:
    """Shared by the admin endpoint and the EventBridge-scheduled Lambda invocation."""
    if job == "accrual":
        count = balances.run_accruals(db)
        db.commit()
        return {"job": job, "balances_synced": count}
    if job == "year-end":
        target = year or date.today().year
        updated = balances.recompute_carry_forward(db, target)
        db.commit()
        return {"job": job, "year": target, "balances_updated": updated}
    if job == "reminders":
        return {"job": job, "reminders_sent": notifications.send_reminders(db)}
    raise HTTPException(404, "Unknown job (accrual | year-end | reminders)")


@router.get("/admin/stats/balances-overview")
def balances_overview(year: int | None = None, db: Session = Depends(get_db), _: Employee = Depends(require_hr)):
    """Compact matrix used by the admin balance adjustment screen."""
    year = year or date.today().year
    emps = db.scalars(select(Employee).where(Employee.status == "ACTIVE").order_by(Employee.first_name)).all()
    out = [{"employee": S.employee_brief(e), "balances": balances.employee_balances(db, e, year)} for e in emps]
    db.commit()
    return out

