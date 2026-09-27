"""Departments, designations and leave types."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .. import serializers as S
from ..auth import get_current_user, require_hr
from ..database import get_db
from ..models import Department, Designation, Employee, LeaveRequest, LeaveType
from ..schemas import DepartmentIn, DesignationIn, LeaveTypeIn
from ..services import audit, balances, calendars

router = APIRouter(tags=["catalog"])


def _headcounts(db: Session, column) -> dict[int, int]:
    rows = db.execute(select(column, func.count()).where(Employee.status == "ACTIVE").group_by(column)).all()
    return {k: v for k, v in rows if k is not None}


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "A record with the same name or code already exists") from exc


# ---- Departments -------------------------------------------------------------

@router.get("/departments")
def list_departments(db: Session = Depends(get_db), _: Employee = Depends(get_current_user)):
    counts = _headcounts(db, Employee.department_id)
    rows = db.scalars(select(Department).options(selectinload(Department.head)).order_by(Department.name))
    return [S.department(d, counts.get(d.id, 0)) for d in rows]


@router.post("/departments", status_code=201)
def create_department(body: DepartmentIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = Department(**body.model_dump())
    db.add(d)
    db.flush()
    audit.log(db, user.id, "department", d.id, "CREATE", body.model_dump())
    _commit(db)
    return S.department(d, 0)


@router.put("/departments/{dept_id}")
def update_department(dept_id: int, body: DepartmentIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = db.get(Department, dept_id) or _404("Department")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    audit.log(db, user.id, "department", d.id, "UPDATE", body.model_dump())
    _commit(db)
    return S.department(d, _headcounts(db, Employee.department_id).get(d.id, 0))


@router.delete("/departments/{dept_id}")
def delete_department(dept_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = db.get(Department, dept_id) or _404("Department")
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.department_id == d.id, Employee.status == "ACTIVE")):
        raise HTTPException(400, "Move active employees out of this department first")
    audit.log(db, user.id, "department", d.id, "DELETE", {"name": d.name})
    db.delete(d)
    _commit(db)
    return {"ok": True}


# ---- Designations ------------------------------------------------------------

@router.get("/designations")
def list_designations(db: Session = Depends(get_db), _: Employee = Depends(get_current_user)):
    counts = _headcounts(db, Employee.designation_id)
    rows = db.scalars(select(Designation).order_by(Designation.level.desc(), Designation.name))
    return [S.designation(d, counts.get(d.id, 0)) for d in rows]


@router.post("/designations", status_code=201)
def create_designation(body: DesignationIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = Designation(**body.model_dump())
    db.add(d)
    db.flush()
    audit.log(db, user.id, "designation", d.id, "CREATE", body.model_dump())
    _commit(db)
    return S.designation(d, 0)


@router.put("/designations/{des_id}")
def update_designation(des_id: int, body: DesignationIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = db.get(Designation, des_id) or _404("Designation")
    for k, v in body.model_dump().items():
        setattr(d, k, v)
    audit.log(db, user.id, "designation", d.id, "UPDATE", body.model_dump())
    _commit(db)
    return S.designation(d)


@router.delete("/designations/{des_id}")
def delete_designation(des_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    d = db.get(Designation, des_id) or _404("Designation")
    if db.scalar(select(func.count()).select_from(Employee).where(Employee.designation_id == d.id, Employee.status == "ACTIVE")):
        raise HTTPException(400, "Designation is assigned to active employees")
    audit.log(db, user.id, "designation", d.id, "DELETE", {"name": d.name})
    db.delete(d)
    _commit(db)
    return {"ok": True}


# ---- Leave types / policies --------------------------------------------------

@router.get("/leave-types")
def list_leave_types(
    include_inactive: bool = False,
    employee_id: int | None = None,
    country_code: str | None = None,
    db: Session = Depends(get_db),
    user: Employee = Depends(get_current_user),
):
    """All leave types, or only those applicable to an employee (`employee_id`) / a country."""
    stmt = select(LeaveType).order_by(LeaveType.sort_order, LeaveType.name)
    if not include_inactive:
        stmt = stmt.where(LeaveType.is_active.is_(True))
    types = list(db.scalars(stmt))
    if employee_id is not None:
        emp = db.get(Employee, employee_id)
        if emp is None:
            raise HTTPException(404, "Employee not found")
        country_code = calendars.employee_country(db, emp)
    if employee_id is not None or country_code:
        types = [t for t in types if balances.applies_to_country(t, (country_code or "").upper() or None)]
    return [S.leave_type(t) for t in types]


@router.post("/leave-types", status_code=201)
def create_leave_type(body: LeaveTypeIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    data = body.model_dump()
    data["accrual_frequency"] = body.accrual_frequency.value
    data["code"] = body.code.upper()
    t = LeaveType(**data)
    db.add(t)
    db.flush()
    audit.log(db, user.id, "leave_type", t.id, "CREATE", data)
    _commit(db)
    return S.leave_type(t)


@router.put("/leave-types/{type_id}")
def update_leave_type(type_id: int, body: LeaveTypeIn, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    t = db.get(LeaveType, type_id) or _404("Leave type")
    data = body.model_dump()
    data["accrual_frequency"] = body.accrual_frequency.value
    data["code"] = body.code.upper()
    before = S.leave_type(t)
    for k, v in data.items():
        setattr(t, k, v)
    audit.log(db, user.id, "leave_type", t.id, "UPDATE", {"before": before, "after": data})
    _commit(db)
    return S.leave_type(t)


@router.delete("/leave-types/{type_id}")
def delete_leave_type(type_id: int, db: Session = Depends(get_db), user: Employee = Depends(require_hr)):
    t = db.get(LeaveType, type_id) or _404("Leave type")
    in_use = db.scalar(select(func.count()).select_from(LeaveRequest).where(LeaveRequest.leave_type_id == t.id))
    if in_use:
        t.is_active = False  # keep history intact
        action = "DEACTIVATE"
    else:
        db.delete(t)
        action = "DELETE"
    audit.log(db, user.id, "leave_type", type_id, action, {"code": t.code})
    _commit(db)
    return {"ok": True, "action": action}


def _404(what: str):
    raise HTTPException(404, f"{what} not found")
