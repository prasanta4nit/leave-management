from collections import Counter, defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, is_manager, require_hr, subordinate_ids
from ..database import get_db
from ..models import (
    AuditLog,
    Department,
    Employee,
    Holiday,
    LeaveRequest,
    LeaveType,
    RequestStatus,
    WfhRequest,
)
from ..services import balances
from .approvals import pending_for
from .calendar import team_ids
from .leaves import calendar_entries

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
ACTIVE = (RequestStatus.PENDING.value, RequestStatus.APPROVED.value)


def _todays_status(db: Session, ids: set[int], day: date) -> dict[int, dict]:
    status: dict[int, dict] = {}
    for r in db.scalars(
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.leave_type))
        .where(
            LeaveRequest.employee_id.in_(ids or {0}),
            LeaveRequest.status == RequestStatus.APPROVED.value,
            LeaveRequest.start_date <= day,
            LeaveRequest.end_date >= day,
        )
    ):
        label = r.leave_type.name
        if r.duration_type == "HALF_DAY":
            label += " (½ day)"
        elif r.duration_type == "HOURLY":
            label += f" ({float(r.hours):g}h)"
        status[r.employee_id] = {"presence": "ON_LEAVE", "label": label, "color": r.leave_type.color}
    for w in db.scalars(
        select(WfhRequest).where(
            WfhRequest.employee_id.in_(ids or {0}),
            WfhRequest.status == RequestStatus.APPROVED.value,
            WfhRequest.start_date <= day,
            WfhRequest.end_date >= day,
        )
    ):
        status.setdefault(w.employee_id, {"presence": "WFH", "label": "Working from home", "color": "#0ea5e9"})
    return status


@router.get("/employee")
def employee_dashboard(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    today = date.today()
    bal = balances.employee_balances(db, user, today.year)
    db.commit()

    upcoming = db.scalars(
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.leave_type), selectinload(LeaveRequest.employee))
        .where(LeaveRequest.employee_id == user.id, LeaveRequest.status.in_(ACTIVE), LeaveRequest.end_date >= today)
        .order_by(LeaveRequest.start_date)
        .limit(5)
    ).all()
    holidays = db.scalars(select(Holiday).where(Holiday.date >= today).order_by(Holiday.date).limit(5)).all()

    recent: list[dict] = []
    for r in db.scalars(
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.leave_type), selectinload(LeaveRequest.employee), selectinload(LeaveRequest.decided_by), selectinload(LeaveRequest.current_approver))
        .where(LeaveRequest.employee_id == user.id)
        .order_by(LeaveRequest.applied_at.desc())
        .limit(5)
    ):
        recent.append(S.leave_request(r))
    for w in db.scalars(select(WfhRequest).where(WfhRequest.employee_id == user.id).order_by(WfhRequest.applied_at.desc()).limit(3)):
        recent.append(S.wfh_request(w))
    recent.sort(key=lambda x: x["applied_at"], reverse=True)

    team = team_ids(db, user) - {user.id}
    out_today = _todays_status(db, team, today)
    people = {e.id: e for e in db.scalars(select(Employee).where(Employee.id.in_(set(out_today) or {0})))}

    return {
        "balances": bal,
        "upcoming_leaves": [S.leave_request(r) for r in upcoming],
        "upcoming_holidays": [S.holiday(h) for h in holidays],
        "recent_requests": recent[:6],
        "pending_count": sum(1 for r in recent if r["status"] == "PENDING"),
        "team_out_today": [{**S.employee_brief(people[i]), **st} for i, st in out_today.items() if i in people],
        "is_manager": is_manager(db, user),
    }


@router.get("/manager")
def manager_dashboard(db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    today = date.today()
    direct = db.scalars(
        select(Employee)
        .options(selectinload(Employee.designation), selectinload(Employee.department))
        .where(Employee.manager_id == user.id, Employee.status == "ACTIVE")
        .order_by(Employee.first_name)
    ).all()
    all_reports = subordinate_ids(db, user.id)
    status = _todays_status(db, all_reports, today)
    members = [
        {**S.employee_brief(e), **status.get(e.id, {"presence": "AVAILABLE", "label": "Available", "color": "#22c55e"})}
        for e in direct
    ]
    counts = Counter(m["presence"] for m in members)
    pending = [p for p in pending_for(db, user) if p.get("awaiting_me") or user.is_hr]
    horizon = today + timedelta(days=13)
    upcoming = [
        item for item in calendar_entries(db, today, horizon, all_reports, include_pending=True)
    ]
    upcoming.sort(key=lambda x: x["start_date"])
    return {
        "team_size": len(all_reports),
        "direct_reports": members,
        "availability": {
            "available": counts.get("AVAILABLE", 0),
            "on_leave": counts.get("ON_LEAVE", 0),
            "wfh": counts.get("WFH", 0),
        },
        "pending_approvals": pending[:10],
        "pending_count": len(pending),
        "upcoming_team_leaves": upcoming,
    }


@router.get("/admin")
def admin_dashboard(db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    today = date.today()
    employees = db.scalars(
        select(Employee).options(selectinload(Employee.department)).where(Employee.status == "ACTIVE")
    ).all()
    ids = {e.id for e in employees}
    by_dept = Counter(e.department.name if e.department else "Unassigned" for e in employees)
    by_type = Counter(e.employment_type for e in employees)
    month_start = today.replace(day=1)
    new_joiners = [S.employee_brief(e) for e in employees if e.joining_date >= month_start - timedelta(days=60)]

    status = _todays_status(db, ids, today)
    people = {e.id: e for e in employees}
    pending_counts = {}
    for label, model in (("leave", LeaveRequest), ("wfh", WfhRequest)):
        pending_counts[label] = db.scalar(select(func.count()).select_from(model).where(model.status == RequestStatus.PENDING.value))

    # Leave days taken this year by type and by month.
    types = {t.id: t for t in db.scalars(select(LeaveType))}
    by_leave_type: dict[str, float] = defaultdict(float)
    monthly: dict[int, float] = defaultdict(float)
    for r in db.scalars(
        select(LeaveRequest).where(
            LeaveRequest.status == RequestStatus.APPROVED.value, extract("year", LeaveRequest.start_date) == today.year
        )
    ):
        by_leave_type[types[r.leave_type_id].name] += float(r.total_days)
        monthly[r.start_date.month] += float(r.total_days)

    holidays = db.scalars(select(Holiday).where(Holiday.date >= today).order_by(Holiday.date).limit(5)).all()
    recent_audit = db.scalars(
        select(AuditLog).options(selectinload(AuditLog.actor)).order_by(AuditLog.created_at.desc()).limit(8)
    ).all()
    dept_count = db.scalar(select(func.count()).select_from(Department))

    return {
        "headcount": len(employees),
        "departments": dept_count,
        "by_department": [{"name": k, "count": v} for k, v in by_dept.most_common()],
        "by_employment_type": [{"name": k, "count": v} for k, v in by_type.most_common()],
        "new_joiners": new_joiners,
        "on_leave_today": [{**S.employee_brief(people[i]), **st} for i, st in status.items() if st["presence"] == "ON_LEAVE"],
        "wfh_today": [{**S.employee_brief(people[i]), **st} for i, st in status.items() if st["presence"] == "WFH"],
        "pending": pending_counts,
        "pending_total": sum(pending_counts.values()),
        "leave_by_type": [
            {"name": t.name, "color": t.color, "days": round(by_leave_type.get(t.name, 0), 2)}
            for t in types.values()
            if t.is_active
        ],
        "leave_by_month": [{"month": m, "days": round(monthly.get(m, 0), 2)} for m in range(1, 13)],
        "upcoming_holidays": [S.holiday(h) for h in holidays],
        "recent_activity": [
            {
                "id": a.id,
                "actor": S.employee_brief(a.actor),
                "entity": a.entity,
                "entity_id": a.entity_id,
                "action": a.action,
                "created_at": a.created_at,
            }
            for a in recent_audit
        ],
    }
