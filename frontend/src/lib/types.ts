export type Role = 'EMPLOYEE' | 'HR' | 'ADMIN';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type RequestKind = 'LEAVE' | 'WFH';
export type DurationType = 'FULL_DAY' | 'HALF_DAY';

export interface EmployeeBrief {
  id: number;
  employee_code: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  designation: string | null;
  department: string | null;
  department_id: number | null;
  country_code: string | null;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface Employee extends EmployeeBrief {
  phone: string | null;
  designation_id: number | null;
  manager_id: number | null;
  manager: EmployeeBrief | null;
  role: Role;
  employment_type: 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
  joining_date: string;
  location: string | null;
  holiday_calendar_id: number | null; // explicit override (null = follow country)
  holiday_calendar?: HolidayCalendarBrief | null; // effective calendar (profile / me only)
  bio: string | null;
  direct_report_count: number;
  is_manager?: boolean;
  // private fields (self / manager chain / HR)
  gender?: string | null;
  date_of_birth?: string | null;
  exit_date?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
}

export interface Me extends Employee {
  is_manager: boolean;
  is_hr: boolean;
  is_admin: boolean;
  settings: { company_name: string; weekend_days: number[]; max_optional_holidays: number };
}

export interface OrgNode extends EmployeeBrief {
  children: OrgNode[];
}

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
  head_id: number | null;
  head: EmployeeBrief | null;
  headcount: number | null;
}

export interface Designation {
  id: number;
  name: string;
  level: number;
  headcount: number | null;
}

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  description: string | null;
  color: string;
  is_paid: boolean;
  is_unlimited: boolean;
  annual_quota: number;
  accrual_frequency: 'YEARLY' | 'QUARTERLY' | 'MONTHLY';
  prorate_on_joining: boolean;
  carry_forward_enabled: boolean;
  max_carry_forward: number;
  allow_half_day: boolean;
  allow_negative_balance: boolean;
  allow_backdated: boolean;
  min_notice_days: number;
  max_consecutive_days: number | null;
  country_codes: string[]; // empty = all countries
  is_active: boolean;
  sort_order: number;
}

export interface Balance {
  applicable: boolean; // false = not in the employee's country policy (shown because it was used)
  leave_type_id: number;
  leave_type_code: string;
  leave_type_name: string;
  color: string;
  is_unlimited: boolean;
  is_paid: boolean;
  year: number;
  annual_quota: number;
  allocated: number;
  accrued: number;
  carried_forward: number;
  adjusted: number;
  credited: number;
  used: number;
  pending: number;
  available: number | null;
}

interface ApprovalFields {
  id: number;
  kind: RequestKind;
  employee: EmployeeBrief;
  status: RequestStatus;
  approval_stage: 'MANAGER' | 'HR' | null;
  current_approver: EmployeeBrief | null;
  decided_by: EmployeeBrief | null;
  decided_at: string | null;
  decision_comment: string | null;
  applied_at: string;
  updated_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string | null;
  // present in approval lists / details
  can_override?: boolean;
  awaiting_me?: boolean;
  can_approve?: boolean;
  history?: HistoryEntry[];
}

export interface LeaveRequest extends ApprovalFields {
  kind: 'LEAVE';
  leave_type: { id: number; code: string; name: string; color: string };
  duration_type: DurationType;
  cc_emails?: string[];
  half_day_session: 'FIRST_HALF' | 'SECOND_HALF' | null;
}

export interface WfhRequest extends ApprovalFields {
  kind: 'WFH';
}

export type AnyRequest = LeaveRequest | WfhRequest;

export interface HistoryEntry {
  id: number;
  request_kind: RequestKind;
  request_id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor: EmployeeBrief | null;
  comment: string | null;
  is_override: boolean;
  created_at: string;
  request?: AnyRequest;
}

export interface HolidayCalendarBrief {
  id: number;
  name: string;
  country_code: string | null;
}

export interface HolidayCalendar extends HolidayCalendarBrief {
  description: string | null;
  weekend_days: number[] | null; // null = company default
  is_default: boolean;
  holiday_count: number | null;
  employee_count: number | null;
}

export interface Holiday {
  id: number;
  name: string;
  date: string;
  is_optional: boolean;
  description: string | null;
  weekday: string;
  calendar_id: number;
  calendar_name: string | null;
  country_code: string | null;
  opted_in?: boolean;
  members_affected?: number;
}

export interface CalendarData {
  start: string;
  end: string;
  weekend_days: number[];
  holidays: Holiday[];
  calendars: HolidayCalendarBrief[];
  leaves: LeaveRequest[];
  wfh: WfhRequest[];
  members: number;
}

export interface PersonStatus extends EmployeeBrief {
  presence: 'AVAILABLE' | 'ON_LEAVE' | 'WFH';
  label: string;
  color: string;
}

export interface ReportResult {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}

export type Settings = Record<string, unknown> & {
  company_name: string;
  timezone: string;
  weekend_days: number[];
  leave_approval_flow: string;
  wfh_approval_flow: string;
  auto_approve_when_no_approver: boolean;
  reminder_after_hours: number;
  max_optional_holidays: number;
  max_wfh_days_per_month: number;
  notify_hr_on_leave: boolean;
  show_celebrations: boolean;
};
