from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import extract, func, or_, select
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import can_view_private, get_current_user, is_manager, require_hr
from ..database import get_db
from ..models import Employee, EmployeeStatus, HolidayCalendar, LeaveRequest
from ..schemas import EmployeeCreate, EmployeeUpdate, SelfProfileUpdate
from ..services import audit, balances, calendars, cognito

router = APIRouter(prefix="/employees", tags=["employees"])

_LOAD = (
    selectinload(Employee.designation),
    selectinload(Employee.department),
    selectinload(Employee.manager),
    selectinload(Employee.reports),
)


def _get(db: Session, employee_id: int) -> Employee:
    emp = db.scalar(select(Employee).options(*_LOAD).where(Employee.id == employee_id))
    if emp is None:
        raise HTTPException(404, "Employee not found")
    return emp


def _check_manager(db: Session, employee_id: int | None, manager_id: int | None) -> None:
    if manager_id is None:
        return
    if employee_id is not None and manager_id == employee_id:
        raise HTTPException(400, "An employee cannot report to themselves")
    mgr = db.get(Employee, manager_id)
    if mgr is None:
        raise HTTPException(400, "Reporting manager not found")
    # Walk up from the proposed manager; hitting the employee means a cycle.
    seen, cur = set(), mgr
    while cur is not None and employee_id is not None:
        if cur.id == employee_id:
            raise HTTPException(400, "This change would create a circular reporting line")
        if cur.id in seen:
            break
        seen.add(cur.id)
        cur = cur.manager


def _check_calendar(db: Session, calendar_id: int | None) -> None:
    if calendar_id is not None and db.get(HolidayCalendar, calendar_id) is None:
        raise HTTPException(400, "Holiday calendar not found")


@router.get("")
def list_employees(
    q: str | None = None,
    department_id: int | None = None,
    designation_id: int | None = None,
    manager_id: int | None = None,
    role: str | None = None,
    country_code: str | None = None,
    status: str | None = Query(default="ACTIVE"),
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    stmt = select(Employee).options(*_LOAD)
    if status and status != "ALL":
        stmt = stmt.where(Employee.status == status)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if designation_id:
        stmt = stmt.where(Employee.designation_id == designation_id)
    if manager_id:
        stmt = stmt.where(Employee.manager_id == manager_id)
    if role:
        stmt = stmt.where(Employee.role == role)
    if country_code:
        stmt = stmt.where(Employee.country_code == country_code.upper())
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Employee.first_name).like(like),
                func.lower(Employee.last_name).like(like),
                func.lower(Employee.first_name + " " + Employee.last_name).like(like),
                func.lower(Employee.email).like(like),
                func.lower(Employee.employee_code).like(like),
            )
        )
    rows = db.scalars(stmt.order_by(Employee.first_name, Employee.last_name)).all()
    return [S.employee(e, private=user.is_hr) for e in rows]


@router.get("/org-chart")
def org_chart(db: Session = Depends(get_db), _: Employee = Depends(get_current_user)):
    rows = db.scalars(select(Employee).options(*_LOAD).where(Employee.status == EmployeeStatus.ACTIVE.value)).all()
    by_id = {e.id: e for e in rows}
    children: dict[int | None, list[Employee]] = {}
    for e in rows:
        parent = e.manager_id if e.manager_id in by_id else None
        children.setdefault(parent, []).append(e)

    def build(e: Employee, depth: int = 0) -> dict:
        kids = sorted(children.get(e.id, []), key=lambda x: (-(x.designation.level if x.designation else 0), x.first_name))
        return {**S.employee_brief(e), "children": [build(k, depth + 1) for k in kids] if depth < 20 else []}

    roots = sorted(children.get(None, []), key=lambda x: (-(x.designation.level if x.designation else 0), x.first_name))
    return [build(r) for r in roots]


@router.put("/me/profile")
def update_my_profile(body: SelfProfileUpdate, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(user, k, v)
    audit.log(db, user.id, "employee", user.id, "SELF_PROFILE_UPDATE", changes)
    db.commit()
    return S.employee(_get(db, user.id))


@router.get("/{employee_id}")
def get_employee(employee_id: int, db: Session = Depends(get_db), user: Employee = Depends(get_current_user)):
    emp = _get(db, employee_id)
    return {
        **S.employee(emp, private=can_view_private(db, user, emp.id)),
        "is_manager": is_manager(db, emp),
        "holiday_calendar": calendars.brief(calendars.calendar_for(db, emp)),
    }


@router.get("/{employee_id}/team")
def get_team(employee_id: int, db: Session = Depends(get_db), _: Employee = Depends(get_current_user)):
    emp = _get(db, employee_id)
    peers = []
    if emp.manager_id:
        peers = db.scalars(
            select(Employee)
            .options(*_LOAD)
            .where(Employee.manager_id == emp.manager_id, Employee.id != emp.id, Employee.status == "ACTIVE")
        ).all()
    reports = [r for r in emp.reports if r.status == "ACTIVE"]
    return {
        "manager": S.employee_brief(emp.manager),
        "peers": [S.employee_brief(p) for p in peers],
        "direct_reports": [S.employee_brief(r) for r in reports],
    }


@router.get("/{employee_id}/balances")
def get_balances(
    employee_id: int,
    year: int | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if not can_view_private(db, user, employee_id):
        raise HTTPException(403, "Not allowed")
    emp = _get(db, employee_id)
    result = balances.employee_balances(db, emp, year or date.today().year)
    db.commit()
    return result


@router.get("/{employee_id}/leaves")
def get_leave_history(
    employee_id: int,
    year: int | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    if not can_view_private(db, user, employee_id):
        raise HTTPException(403, "Not allowed")
    stmt = (
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.employee), selectinload(LeaveRequest.leave_type))
        .where(LeaveRequest.employee_id == employee_id)
    )
    if year:
        stmt = stmt.where(extract("year", LeaveRequest.start_date) == year)
    return [S.leave_request(r) for r in db.scalars(stmt.order_by(LeaveRequest.start_date.desc()))]


@router.post("", status_code=201)
def create_employee(body: EmployeeCreate, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    if db.scalar(select(Employee).where(func.lower(Employee.email) == body.email.lower())):
        raise HTTPException(409, "An employee with this email already exists")
    if body.role.value == "ADMIN" and not user.is_admin:
        raise HTTPException(403, "Only admins can create admin users")
    _check_manager(db, None, body.manager_id)
    _check_calendar(db, body.holiday_calendar_id)
    data = body.model_dump(exclude={"send_invite", "employee_code"})
    data["role"] = body.role.value
    data["employment_type"] = body.employment_type.value
    code = body.employee_code
    if not code:
        next_id = (db.scalar(select(func.max(Employee.id))) or 0) + 1
        code = f"EMP{next_id:03d}"
    if db.scalar(select(Employee).where(Employee.employee_code == code)):
        raise HTTPException(409, "Employee code already in use")
    data["email"] = body.email.lower()
    emp = Employee(**data, employee_code=code)
    db.add(emp)
    db.flush()
    if body.send_invite:
        emp.cognito_sub = cognito.create_user(emp.email, emp.first_name, emp.last_name)
    audit.log(db, user.id, "employee", emp.id, "CREATE", {"email": emp.email, "code": code})
    db.commit()
    return S.employee(_get(db, emp.id))


@router.put("/{employee_id}")
def update_employee(
    employee_id: int, body: EmployeeUpdate, db: Session = Depends(get_db), user: Employee = Depends(require_hr)
):
    emp = _get(db, employee_id)
    changes = body.model_dump(exclude_unset=True)
    if "manager_id" in changes:
        _check_manager(db, emp.id, changes["manager_id"])
    if "holiday_calendar_id" in changes:
        _check_calendar(db, changes["holiday_calendar_id"])
    if "role" in changes and changes["role"] is not None:
        changes["role"] = changes["role"].value
        if (changes["role"] == "ADMIN" or emp.is_admin) and not user.is_admin:
            raise HTTPException(403, "Only admins can change admin roles")
    if "employment_type" in changes and changes["employment_type"] is not None:
        changes["employment_type"] = changes["employment_type"].value
    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
        clash = db.scalar(select(Employee).where(Employee.email == changes["email"], Employee.id != emp.id))
        if clash:
            raise HTTPException(409, "Email already in use")
    if changes.get("status") and changes["status"] != emp.status:
        cognito.set_enabled(emp.email, changes["status"] == "ACTIVE")
    before = {k: getattr(emp, k) for k in changes}
    for k, v in changes.items():
        setattr(emp, k, v)
    audit.log(db, user.id, "employee", emp.id, "UPDATE", {"before": before, "after": changes})
    db.commit()
    return S.employee(_get(db, emp.id))


@router.delete("/{employee_id}")
def deactivate_employee(employee_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    emp = _get(db, employee_id)
    if emp.id == user.id:
        raise HTTPException(400, "You cannot deactivate yourself")
    emp.status = EmployeeStatus.INACTIVE.value
    emp.exit_date = emp.exit_date or date.today()
    # Re-home direct reports to the departing employee's manager.
    for r in list(emp.reports):
        r.manager_id = emp.manager_id
    cognito.set_enabled(emp.email, False)
    audit.log(db, user.id, "employee", emp.id, "DEACTIVATE")
    db.commit()
    return {"ok": True}
