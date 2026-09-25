"""Request bodies. Responses are built by `serializers.py`."""

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from .models import AccrualFrequency, DurationType, EmploymentType, HalfDaySession, Role


class EmployeeBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: EmailStr
    phone: str | None = None
    gender: str | None = None
    date_of_birth: date | None = None
    designation_id: int | None = None
    department_id: int | None = None
    manager_id: int | None = None
    role: Role = Role.EMPLOYEE
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    joining_date: date
    location: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class EmployeeCreate(EmployeeBase):
    employee_code: str | None = Field(default=None, max_length=20)
    send_invite: bool = True


class EmployeeUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    employee_code: str | None = None
    phone: str | None = None
    gender: str | None = None
    date_of_birth: date | None = None
    designation_id: int | None = None
    department_id: int | None = None
    manager_id: int | None = None
    role: Role | None = None
    employment_type: EmploymentType | None = None
    joining_date: date | None = None
    exit_date: date | None = None
    status: Literal["ACTIVE", "INACTIVE"] | None = None
    location: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None


class SelfProfileUpdate(BaseModel):
    """Fields an employee may edit on their own profile."""

    phone: str | None = None
    location: str | None = None
    address: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    bio: str | None = None
    avatar_url: str | None = None
    date_of_birth: date | None = None


class DepartmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str = Field(min_length=1, max_length=20)
    description: str | None = None
    head_id: int | None = None


class DesignationIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    level: int = Field(default=1, ge=1, le=20)


class LeaveTypeIn(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=60)
    description: str | None = None
    color: str = "#6366f1"
    is_paid: bool = True
    is_unlimited: bool = False
    annual_quota: Decimal = Field(default=Decimal(0), ge=0, le=365)
    accrual_frequency: AccrualFrequency = AccrualFrequency.YEARLY
    prorate_on_joining: bool = True
    carry_forward_enabled: bool = False
    max_carry_forward: Decimal = Field(default=Decimal(0), ge=0, le=365)
    allow_half_day: bool = True
    allow_hourly: bool = False
    allow_negative_balance: bool = False
    allow_backdated: bool = False
    min_notice_days: int = Field(default=0, ge=0, le=365)
    max_consecutive_days: int | None = Field(default=None, ge=1, le=365)
    is_active: bool = True
    sort_order: int = 0


class LeaveApply(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    duration_type: DurationType = DurationType.FULL_DAY
    half_day_session: HalfDaySession | None = None
    hours: Decimal | None = Field(default=None, gt=0, le=24)
    reason: str | None = Field(default=None, max_length=1000)
    employee_id: int | None = None  # HR applying on behalf of someone

    @model_validator(mode="after")
    def _check(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        if self.duration_type != DurationType.FULL_DAY and self.start_date != self.end_date:
            raise ValueError("Half-day and hourly leave must be for a single date")
        if self.duration_type == DurationType.HALF_DAY and self.half_day_session is None:
            raise ValueError("Select first half or second half")
        if self.duration_type == DurationType.HOURLY and not self.hours:
            raise ValueError("Enter the number of hours")
        return self


class Decision(BaseModel):
    comment: str | None = Field(default=None, max_length=500)


class CancelIn(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class WfhApply(BaseModel):
    start_date: date
    end_date: date
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _check(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        return self


class HolidayIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    date: date
    is_optional: bool = False
    description: str | None = None


class BalanceAdjust(BaseModel):
    employee_id: int
    leave_type_id: int
    year: int
    delta: Decimal = Field(ge=-365, le=365)
    reason: str = Field(min_length=3, max_length=500)


class SettingsUpdate(BaseModel):
    values: dict[str, Any]
