"""Leave balance, accrual and carry-forward rules.

A balance row stores only credits (allocated, accrued, carried forward, manual adjustments).
Used and pending days are always derived from leave requests, so cancelling / modifying a
request can never leave a balance out of sync.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session

from ..models import (
    AccrualFrequency,
    Employee,
    EmployeeStatus,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    RequestStatus,
)
from . import calendars


ZERO = Decimal("0")


def round_half(x: Decimal) -> Decimal:
    """Round to the nearest 0.5 day."""
    return (Decimal(x) * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2


def _accrual_months(lt: LeaveType) -> list[int]:
    if lt.accrual_frequency == AccrualFrequency.MONTHLY.value:
        return list(range(1, 13))
    if lt.accrual_frequency == AccrualFrequency.QUARTERLY.value:
        return [1, 4, 7, 10]
    return []


def _per_period(lt: LeaveType) -> Decimal:
    periods = len(_accrual_months(lt)) or 1
    return (Decimal(lt.annual_quota) / periods).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def initial_allocation(lt: LeaveType, emp: Employee, year: int) -> Decimal:
    if lt.is_unlimited or lt.accrual_frequency != AccrualFrequency.YEARLY.value:
        return ZERO
    quota = Decimal(lt.annual_quota)
    if emp.joining_date.year > year:
        return ZERO
    if lt.prorate_on_joining and emp.joining_date.year == year:
        months_remaining = 12 - emp.joining_date.month + 1
        return round_half(quota * months_remaining / 12)
    return quota


def used_and_pending(db: Session, employee_id: int, leave_type_id: int, year: int) -> tuple[Decimal, Decimal]:
    rows = db.execute(
        select(LeaveRequest.status, func.coalesce(func.sum(LeaveRequest.total_days), 0))
        .where(
            LeaveRequest.employee_id == employee_id,
            LeaveRequest.leave_type_id == leave_type_id,
            extract("year", LeaveRequest.start_date) == year,
            LeaveRequest.status.in_([RequestStatus.APPROVED.value, RequestStatus.PENDING.value]),
        )
        .group_by(LeaveRequest.status)
    ).all()
    totals = {status: Decimal(str(total)) for status, total in rows}
    return totals.get(RequestStatus.APPROVED.value, ZERO), totals.get(RequestStatus.PENDING.value, ZERO)


def compute_carry_forward(db: Session, emp: Employee, lt: LeaveType, year: int) -> Decimal:
    if not lt.carry_forward_enabled or lt.is_unlimited:
        return ZERO
    prev = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == emp.id,
            LeaveBalance.leave_type_id == lt.id,
            LeaveBalance.year == year - 1,
        )
    )
    if prev is None:
        return ZERO
    used, _ = used_and_pending(db, emp.id, lt.id, year - 1)
    remaining = max(prev.credited - used, ZERO)
    return min(remaining, Decimal(lt.max_carry_forward))


def sync_accruals(bal: LeaveBalance, lt: LeaveType, emp: Employee, today: date) -> None:
    months = _accrual_months(lt)
    if not months or lt.is_unlimited:
        return
    if bal.year > today.year or emp.joining_date.year > bal.year:
        return
    target = 12 if bal.year < today.year else today.month
    first_month = emp.joining_date.month if emp.joining_date.year == bal.year else 1
    per_period = _per_period(lt)
    period_len = 12 // len(months)
    accrued = Decimal(bal.accrued)
    for m in range(bal.last_accrual_month + 1, target + 1):
        # A period is credited if the employee had joined by the end of it.
        if m in months and m + period_len - 1 >= first_month:
            accrued += per_period
    bal.accrued = min(accrued, Decimal(lt.annual_quota))
    bal.last_accrual_month = max(bal.last_accrual_month, target)


def ensure_balance(db: Session, emp: Employee, lt: LeaveType, year: int, today: date | None = None) -> LeaveBalance:
    today = today or date.today()
    bal = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == emp.id,
            LeaveBalance.leave_type_id == lt.id,
            LeaveBalance.year == year,
        )
    )
    if bal is None:
        bal = LeaveBalance(
            employee_id=emp.id,
            leave_type_id=lt.id,
            year=year,
            allocated=initial_allocation(lt, emp, year),
            accrued=ZERO,
            carried_forward=compute_carry_forward(db, emp, lt, year),
            adjusted=ZERO,
            last_accrual_month=0,
        )
        db.add(bal)
    sync_accruals(bal, lt, emp, today)
    db.flush()
    return bal


def applies_to_country(lt: LeaveType, country: str | None) -> bool:
    return not lt.country_codes or (country is not None and country in lt.country_codes)


def applies_to(db: Session, lt: LeaveType, emp: Employee) -> bool:
    return applies_to_country(lt, calendars.employee_country(db, emp))


def applicable_types(db: Session, emp: Employee) -> list[LeaveType]:
    country = calendars.employee_country(db, emp)
    types = db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.sort_order, LeaveType.name))
    return [lt for lt in types if applies_to_country(lt, country)]


def balance_summary(db: Session, emp: Employee, lt: LeaveType, year: int, applicable: bool = True) -> dict:
    used, pending = used_and_pending(db, emp.id, lt.id, year)
    if applicable:
        bal = ensure_balance(db, emp, lt, year)
    else:
        # Not part of the employee's country policy (e.g. they moved country): never create or
        # accrue a balance, just report whatever already exists.
        bal = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == emp.id, LeaveBalance.leave_type_id == lt.id, LeaveBalance.year == year
            )
        ) or LeaveBalance(allocated=ZERO, accrued=ZERO, carried_forward=ZERO, adjusted=ZERO)
    credited = bal.credited
    return {
        "applicable": applicable,
        "leave_type_id": lt.id,
        "leave_type_code": lt.code,
        "leave_type_name": lt.name,
        "color": lt.color,
        "is_unlimited": lt.is_unlimited,
        "is_paid": lt.is_paid,
        "year": year,
        "annual_quota": float(lt.annual_quota),
        "allocated": float(bal.allocated),
        "accrued": float(bal.accrued),
        "carried_forward": float(bal.carried_forward),
        "adjusted": float(bal.adjusted),
        "credited": float(credited),
        "used": float(used),
        "pending": float(pending),
        "available": None if lt.is_unlimited else float(credited - used - pending),
    }


def employee_balances(db: Session, emp: Employee, year: int) -> list[dict]:
    """Balances for the leave types of the employee's country, plus any other type they used that year."""
    country = calendars.employee_country(db, emp)
    types = db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.sort_order, LeaveType.name))
    result = []
    for lt in types:
        if applies_to_country(lt, country):
            result.append(balance_summary(db, emp, lt, year))
        elif sum(used_and_pending(db, emp.id, lt.id, year)) > 0:
            result.append(balance_summary(db, emp, lt, year, applicable=False))
    return result


def available_days(db: Session, emp: Employee, lt: LeaveType, year: int, exclude_request_id: int | None = None) -> Decimal:
    bal = ensure_balance(db, emp, lt, year)
    used, pending = used_and_pending(db, emp.id, lt.id, year)
    available = bal.credited - used - pending
    if exclude_request_id:
        req = db.get(LeaveRequest, exclude_request_id)
        if (
            req
            and req.employee_id == emp.id
            and req.leave_type_id == lt.id
            and req.start_date.year == year
            and req.status in (RequestStatus.PENDING.value, RequestStatus.APPROVED.value)
        ):
            available += Decimal(req.total_days)
    return available


def run_accruals(db: Session, today: date | None = None) -> int:
    """Idempotent: creates missing balances for the year and credits any due accrual periods."""
    today = today or date.today()
    employees = db.scalars(select(Employee).where(Employee.status == EmployeeStatus.ACTIVE.value)).all()
    count = 0
    for emp in employees:
        for lt in applicable_types(db, emp):
            ensure_balance(db, emp, lt, today.year, today)
            count += 1
    return count


def recompute_carry_forward(db: Session, year: int) -> int:
    """Year-end processing: (re)calculate carry-forward into `year` from `year - 1` usage."""
    employees = db.scalars(select(Employee).where(Employee.status == EmployeeStatus.ACTIVE.value)).all()
    updated = 0
    for emp in employees:
        for lt in applicable_types(db, emp):
            bal = ensure_balance(db, emp, lt, year)
            cf = compute_carry_forward(db, emp, lt, year)
            if Decimal(bal.carried_forward) != cf:
                bal.carried_forward = cf
                updated += 1
    db.flush()
    return updated
