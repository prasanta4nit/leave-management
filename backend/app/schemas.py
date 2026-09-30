"""Request bodies. Responses are built by `serializers.py`."""

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field, field_validator, model_validator
from typing_extensions import Annotated

from .models import AccrualFrequency, DurationType, EmploymentType, HalfDaySession, Role


def _country(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    v = v.strip().upper()
    if len(v) != 2 or not v.isalpha():
        raise ValueError("Country must be a 2-letter ISO code, e.g. IN, IL, UA")
    return v


CountryCode = Annotated[str | None, AfterValidator(_country)]


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
    country_code: CountryCode = None
    holiday_calendar_id: int | None = None  # override; normally derived from country
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
    country_code: CountryCode = None
    holiday_calendar_id: int | None = None
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
    allow_negative_balance: bool = False
    allow_backdated: bool = False
    min_notice_days: int = Field(default=0, ge=0, le=365)
    max_consecutive_days: int | None = Field(default=None, ge=1, le=365)
    country_codes: list[str] | None = None  # None / [] = all countries
    is_active: bool = True
    sort_order: int = 0

    @field_validator("country_codes")
    @classmethod
    def _countries(cls, v: list[str] | None) -> list[str] | None:
        if not v:
            return None
        return sorted({_country(c) for c in v})


LEAVE_REASON_MIN_LENGTH = 30
LEAVE_MAX_CC = 10


class LeaveDraft(BaseModel):
    """Leave dates and type. Used on its own for the live day-count preview."""

    leave_type_id: int
    start_date: date
    end_date: date
    duration_type: DurationType = DurationType.FULL_DAY
    half_day_session: HalfDaySession | None = None
    reason: str | None = Field(default=None, max_length=1000)
    employee_id: int | None = None  # HR applying on behalf of someone

    @model_validator(mode="after")
    def _check(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")
        if self.duration_type != DurationType.FULL_DAY and self.start_date != self.end_date:
            raise ValueError("Half-day leave must be for a single date")
        if self.duration_type == DurationType.HALF_DAY and self.half_day_session is None:
            raise ValueError("Select first half or second half")
        return self


class LeaveApply(LeaveDraft):
    """Submitting or modifying a leave: a written reason is required and people can be CC'd."""

    reason: str = Field(max_length=1000)
    cc_emails: list[EmailStr] = Field(default_factory=list, max_length=LEAVE_MAX_CC)

    @field_validator("reason")
    @classmethod
    def _reason(cls, v: str) -> str:
        v = v.strip()
        if len(v) < LEAVE_REASON_MIN_LENGTH:
            raise ValueError(f"Please give a reason of at least {LEAVE_REASON_MIN_LENGTH} characters ({len(v)} so far)")
        return v

    @field_validator("cc_emails")
    @classmethod
    def _cc(cls, v: list[str]) -> list[str]:
        seen: list[str] = []
        for e in v:
            e = str(e).strip().lower()
            if e not in seen:
                seen.append(e)
        return seen


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


class HolidayCalendarIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    country_code: CountryCode = None
    description: str | None = Field(default=None, max_length=255)
    weekend_days: list[int] | None = None  # None = company default
    is_default: bool = False

    @field_validator("weekend_days")
    @classmethod
    def _weekend(cls, v: list[int] | None) -> list[int] | None:
        if v is None:
            return None
        if any(d not in range(7) for d in v) or len(set(v)) != len(v) or len(v) > 3:
            raise ValueError("weekend_days must be up to 3 distinct weekday numbers 0-6 (Mon=0)")
        return sorted(v)


class HolidayIn(BaseModel):
    calendar_id: int | None = None  # defaults to the company's default calendar
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
