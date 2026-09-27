"""Model -> JSON dict converters."""

from .models import (
    HolidayCalendar,
    Department,
    Designation,
    Employee,
    Holiday,
    LeaveRequest,
    LeaveType,
    RequestHistory,
    WfhRequest,
)


def _f(v):
    return None if v is None else float(v)


def employee_brief(e: Employee | None) -> dict | None:
    if e is None:
        return None
    return {
        "id": e.id,
        "employee_code": e.employee_code,
        "full_name": e.full_name,
        "first_name": e.first_name,
        "last_name": e.last_name,
        "email": e.email,
        "avatar_url": e.avatar_url,
        "designation": e.designation.name if e.designation else None,
        "department": e.department.name if e.department else None,
        "department_id": e.department_id,
        "country_code": e.country_code,
        "status": e.status,
    }


def employee(e: Employee, private: bool = True) -> dict:
    data = {
        **employee_brief(e),
        "phone": e.phone,
        "designation_id": e.designation_id,
        "manager_id": e.manager_id,
        "manager": employee_brief(e.manager),
        "role": e.role,
        "employment_type": e.employment_type,
        "joining_date": e.joining_date,
        "location": e.location,
        "holiday_calendar_id": e.holiday_calendar_id,
        "bio": e.bio,
        "direct_report_count": sum(1 for r in e.reports if r.status == "ACTIVE"),
    }
    if private:
        data.update(
            gender=e.gender,
            date_of_birth=e.date_of_birth,
            exit_date=e.exit_date,
            address=e.address,
            emergency_contact_name=e.emergency_contact_name,
            emergency_contact_phone=e.emergency_contact_phone,
            created_at=e.created_at,
        )
    return data


def department(d: Department, headcount: int | None = None) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "code": d.code,
        "description": d.description,
        "head_id": d.head_id,
        "head": employee_brief(d.head),
        "headcount": headcount,
    }


def designation(d: Designation, headcount: int | None = None) -> dict:
    return {"id": d.id, "name": d.name, "level": d.level, "headcount": headcount}


def leave_type(t: LeaveType) -> dict:
    return {
        "id": t.id,
        "code": t.code,
        "name": t.name,
        "description": t.description,
        "color": t.color,
        "is_paid": t.is_paid,
        "is_unlimited": t.is_unlimited,
        "annual_quota": _f(t.annual_quota),
        "accrual_frequency": t.accrual_frequency,
        "prorate_on_joining": t.prorate_on_joining,
        "carry_forward_enabled": t.carry_forward_enabled,
        "max_carry_forward": _f(t.max_carry_forward),
        "allow_half_day": t.allow_half_day,
        "allow_negative_balance": t.allow_negative_balance,
        "allow_backdated": t.allow_backdated,
        "min_notice_days": t.min_notice_days,
        "max_consecutive_days": t.max_consecutive_days,
        "country_codes": t.country_codes or [],
        "is_active": t.is_active,
        "sort_order": t.sort_order,
    }


def _approval_fields(r) -> dict:
    return {
        "status": r.status,
        "approval_stage": r.approval_stage,
        "current_approver": employee_brief(r.current_approver),
        "decided_by": employee_brief(r.decided_by),
        "decided_at": r.decided_at,
        "decision_comment": r.decision_comment,
        "applied_at": r.applied_at,
        "updated_at": r.updated_at,
        "cancelled_at": r.cancelled_at,
        "cancel_reason": r.cancel_reason,
    }


def leave_request(r: LeaveRequest) -> dict:
    return {
        "kind": "LEAVE",
        "id": r.id,
        "employee": employee_brief(r.employee),
        "leave_type": {"id": r.leave_type.id, "code": r.leave_type.code, "name": r.leave_type.name, "color": r.leave_type.color},
        "start_date": r.start_date,
        "end_date": r.end_date,
        "duration_type": r.duration_type,
        "half_day_session": r.half_day_session,
        "total_days": _f(r.total_days),
        "reason": r.reason,
        **_approval_fields(r),
    }


def wfh_request(r: WfhRequest) -> dict:
    return {
        "kind": "WFH",
        "id": r.id,
        "employee": employee_brief(r.employee),
        "start_date": r.start_date,
        "end_date": r.end_date,
        "total_days": _f(r.total_days),
        "reason": r.reason,
        **_approval_fields(r),
    }


def any_request(kind: str, r) -> dict:
    return {"LEAVE": leave_request, "WFH": wfh_request}[kind](r)


def history(h: RequestHistory) -> dict:
    return {
        "id": h.id,
        "request_kind": h.request_kind,
        "request_id": h.request_id,
        "action": h.action,
        "from_status": h.from_status,
        "to_status": h.to_status,
        "actor": employee_brief(h.actor),
        "comment": h.comment,
        "is_override": h.is_override,
        "created_at": h.created_at,
    }


def holiday(h: Holiday, opted_in: bool | None = None) -> dict:
    data = {
        "id": h.id,
        "name": h.name,
        "date": h.date,
        "is_optional": h.is_optional,
        "description": h.description,
        "calendar_id": h.calendar_id,
        "calendar_name": h.calendar.name if h.calendar else None,
        "country_code": h.calendar.country_code if h.calendar else None,
        "weekday": h.date.strftime("%A"),
    }
    if opted_in is not None:
        data["opted_in"] = opted_in
    return data


def holiday_calendar(c: HolidayCalendar, holiday_count: int | None = None, employee_count: int | None = None) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "country_code": c.country_code,
        "description": c.description,
        "weekend_days": c.weekend_days,
        "is_default": c.is_default,
        "holiday_count": holiday_count,
        "employee_count": employee_count,
    }
