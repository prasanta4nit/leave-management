from __future__ import annotations

import enum
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role(str, enum.Enum):
    EMPLOYEE = "EMPLOYEE"
    HR = "HR"
    ADMIN = "ADMIN"


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class EmploymentType(str, enum.Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    INTERN = "INTERN"


class RequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class DurationType(str, enum.Enum):
    FULL_DAY = "FULL_DAY"
    HALF_DAY = "HALF_DAY"


class HalfDaySession(str, enum.Enum):
    FIRST_HALF = "FIRST_HALF"
    SECOND_HALF = "SECOND_HALF"


class AccrualFrequency(str, enum.Enum):
    YEARLY = "YEARLY"  # full (pro-rated) quota credited at start of year / on joining
    QUARTERLY = "QUARTERLY"
    MONTHLY = "MONTHLY"


class ApprovalStage(str, enum.Enum):
    MANAGER = "MANAGER"
    HR = "HR"


class RequestKind(str, enum.Enum):
    LEAVE = "LEAVE"
    WFH = "WFH"


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    description: Mapped[str | None] = mapped_column(String(255))
    head_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", use_alter=True, ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    head: Mapped[Employee | None] = relationship(foreign_keys=[head_id], post_update=True)


class Designation(Base):
    __tablename__ = "designations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    level: Mapped[int] = mapped_column(Integer, default=1)  # 1 = most junior


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_code: Mapped[str] = mapped_column(String(20), unique=True)
    cognito_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    first_name: Mapped[str] = mapped_column(String(60))
    last_name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(190), unique=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    gender: Mapped[str | None] = mapped_column(String(20))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    designation_id: Mapped[int | None] = mapped_column(ForeignKey("designations.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    role: Mapped[str] = mapped_column(String(20), default=Role.EMPLOYEE.value)
    employment_type: Mapped[str] = mapped_column(String(20), default=EmploymentType.FULL_TIME.value)
    status: Mapped[str] = mapped_column(String(20), default=EmployeeStatus.ACTIVE.value, index=True)
    joining_date: Mapped[date] = mapped_column(Date)
    exit_date: Mapped[date | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(String(100))
    country_code: Mapped[str | None] = mapped_column(String(2), index=True)  # ISO 3166-1 alpha-2
    # Explicit override; when empty the calendar is resolved from country_code (see services/calendars.py).
    holiday_calendar_id: Mapped[int | None] = mapped_column(ForeignKey("holiday_calendars.id", ondelete="SET NULL"))
    address: Mapped[str | None] = mapped_column(String(255))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(100))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(30))
    bio: Mapped[str | None] = mapped_column(Text)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    designation: Mapped[Designation | None] = relationship()
    holiday_calendar: Mapped[HolidayCalendar | None] = relationship()
    department: Mapped[Department | None] = relationship(foreign_keys=[department_id])
    manager: Mapped[Employee | None] = relationship(remote_side=[id], back_populates="reports")
    reports: Mapped[list[Employee]] = relationship(back_populates="manager")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"

    @property
    def is_hr(self) -> bool:
        return self.role in (Role.HR.value, Role.ADMIN.value)

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN.value


class LeaveType(Base):
    __tablename__ = "leave_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(255))
    color: Mapped[str] = mapped_column(String(9), default="#6366f1")
    is_paid: Mapped[bool] = mapped_column(Boolean, default=True)
    is_unlimited: Mapped[bool] = mapped_column(Boolean, default=False)  # e.g. unpaid leave
    annual_quota: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    accrual_frequency: Mapped[str] = mapped_column(String(20), default=AccrualFrequency.YEARLY.value)
    prorate_on_joining: Mapped[bool] = mapped_column(Boolean, default=True)
    carry_forward_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    max_carry_forward: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    allow_half_day: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_negative_balance: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_backdated: Mapped[bool] = mapped_column(Boolean, default=False)
    min_notice_days: Mapped[int] = mapped_column(Integer, default=0)
    max_consecutive_days: Mapped[int | None] = mapped_column(Integer)
    # ISO country codes this leave type/policy applies to. NULL or [] = every country.
    country_codes: Mapped[list[str] | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class LeaveBalance(Base):
    """Credits only. `used` and `pending` are derived from leave requests so they never drift."""

    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("employee_id", "leave_type_id", "year", name="uq_balance"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id", ondelete="CASCADE"))
    year: Mapped[int] = mapped_column(Integer)
    allocated: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    accrued: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    carried_forward: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    adjusted: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=0)
    last_accrual_month: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    leave_type: Mapped[LeaveType] = relationship()

    @property
    def credited(self) -> Decimal:
        return Decimal(self.allocated) + Decimal(self.accrued) + Decimal(self.carried_forward) + Decimal(self.adjusted)


class ApprovalMixin:
    status: Mapped[str] = mapped_column(String(20), default=RequestStatus.PENDING.value, index=True)
    approval_stage: Mapped[str | None] = mapped_column(String(20))
    current_approver_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)
    decision_comment: Mapped[str | None] = mapped_column(String(500))
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancel_reason: Mapped[str | None] = mapped_column(String(500))
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)


class LeaveRequest(ApprovalMixin, Base):
    __tablename__ = "leave_requests"
    __table_args__ = (Index("ix_leave_emp_dates", "employee_id", "start_date", "end_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    duration_type: Mapped[str] = mapped_column(String(20), default=DurationType.FULL_DAY.value)
    half_day_session: Mapped[str | None] = mapped_column(String(20))
    total_days: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reason: Mapped[str | None] = mapped_column(String(1000))

    employee: Mapped[Employee] = relationship(foreign_keys=[employee_id])
    leave_type: Mapped[LeaveType] = relationship()
    current_approver: Mapped[Employee | None] = relationship(foreign_keys="LeaveRequest.current_approver_id")
    decided_by: Mapped[Employee | None] = relationship(foreign_keys="LeaveRequest.decided_by_id")


class WfhRequest(ApprovalMixin, Base):
    __tablename__ = "wfh_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    total_days: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reason: Mapped[str | None] = mapped_column(String(1000))

    employee: Mapped[Employee] = relationship(foreign_keys=[employee_id])
    current_approver: Mapped[Employee | None] = relationship(foreign_keys="WfhRequest.current_approver_id")
    decided_by: Mapped[Employee | None] = relationship(foreign_keys="WfhRequest.decided_by_id")


class RequestHistory(Base):
    """Approval audit trail for leave and WFH requests."""

    __tablename__ = "request_history"
    __table_args__ = (Index("ix_history_request", "request_kind", "request_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    request_kind: Mapped[str] = mapped_column(String(20))
    request_id: Mapped[int] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(30))  # APPLIED, MODIFIED, APPROVED, REJECTED, CANCELLED, ESCALATED, OVERRIDDEN
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str | None] = mapped_column(String(20))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    comment: Mapped[str | None] = mapped_column(String(1000))
    is_override: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    actor: Mapped[Employee | None] = relationship()


class HolidayCalendar(Base):
    """A country/location holiday calendar with its own weekend days."""

    __tablename__ = "holiday_calendars"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    country_code: Mapped[str | None] = mapped_column(String(2), index=True)
    description: Mapped[str | None] = mapped_column(String(255))
    # Python weekday numbers (Mon=0 .. Sun=6). NULL = use the company-wide weekend setting.
    weekend_days: Mapped[list[int] | None] = mapped_column(JSON)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Holiday(Base):
    __tablename__ = "holidays"
    __table_args__ = (UniqueConstraint("calendar_id", "date", "name", name="uq_holiday"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    calendar_id: Mapped[int] = mapped_column(ForeignKey("holiday_calendars.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date, index=True)
    is_optional: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(String(255))

    calendar: Mapped[HolidayCalendar] = relationship()


class OptionalHolidaySelection(Base):
    __tablename__ = "optional_holiday_selections"
    __table_args__ = (UniqueConstraint("employee_id", "holiday_id", name="uq_opt_holiday"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"))
    holiday_id: Mapped[int] = mapped_column(ForeignKey("holidays.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    holiday: Mapped[Holiday] = relationship()


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text)  # JSON-encoded


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(40))
    action: Mapped[str] = mapped_column(String(40))
    details: Mapped[str | None] = mapped_column(Text)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    actor: Mapped[Employee | None] = relationship()
