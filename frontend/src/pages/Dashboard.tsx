import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import {
  ArrowRight,
  Award,
  Briefcase,
  Cake,
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  Clock,
  Home,
  Laptop,
  Palmtree,
  Plus,
  Sparkles,
  Sun,
  UserCheck,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarList, ColumnChart } from '../components/BarChart';
import BalanceCards from '../components/BalanceCards';
import LeaveApplyModal from '../components/LeaveApplyModal';
import RequestDetailModal from '../components/RequestDetailModal';
import {
  Avatar,
  AvatarStack,
  Badge,
  Card,
  CountryTag,
  EmptyState,
  IconBubble,
  PersonCell,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
} from '../components/ui';
import { api, qs } from '../lib/api';
import { useMe } from '../lib/auth';
import { dateRange, durationLabel, fmtDate, fmtDays, fromNow, isoDate, kindLabel, requestTitle, titleCase, toDate } from '../lib/format';
import type {
  AnyRequest,
  Balance,
  CalendarData,
  EmployeeBrief,
  Holiday,
  HolidayCalendarBrief,
  LeaveRequest,
  PersonStatus,
  RequestKind,
} from '../lib/types';

type View = 'me' | 'team' | 'org';
const VIEW_KEY = 'leavedesk.dashboardView';

function readView(): View | null {
  try {
    return (localStorage.getItem(VIEW_KEY) as View | null) ?? null;
  } catch {
    return null;
  }
}

export default function Dashboard() {
  const me = useMe();
  const views: { value: View; label: string }[] = [{ value: 'me', label: 'My desk' }];
  if (me.is_manager) views.push({ value: 'team', label: 'My team' });
  if (me.is_hr) views.push({ value: 'org', label: 'Organization' });
  const stored = readView();
  const [view, setView] = useState<View>(stored && views.some((v) => v.value === stored) ? stored : 'me');
  const choose = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="space-y-6">
      {views.length > 1 && (
        <div className="flex justify-end">
          <Tabs variant="pill" tabs={views} value={view} onChange={choose} />
        </div>
      )}
      {view === 'me' && <MyDesk />}
      {view === 'team' && <TeamView />}
      {view === 'org' && <OrgView />}
    </div>
  );
}

/* ----------------------------------------------------------------------------- My desk */

interface Celebration {
  kind: 'BIRTHDAY' | 'ANNIVERSARY';
  date: string;
  years?: number;
  employee: EmployeeBrief;
}

interface EmployeeDash {
  today: { kind: 'WORKING' | 'WEEKEND' | 'HOLIDAY' | 'ON_LEAVE' | 'WFH'; label: string };
  holiday_calendar: HolidayCalendarBrief | null;
  celebrations: Celebration[];
  balances: Balance[];
  upcoming_leaves: LeaveRequest[];
  upcoming_holidays: Holiday[];
  recent_requests: AnyRequest[];
  team_out_today: PersonStatus[];
}

function MyDesk() {
  const [applying, setApplying] = useState(false);
  const q = useQuery({ queryKey: ['dashboard', 'employee'], queryFn: () => api.get<EmployeeDash>('/dashboard/employee') });
  if (!q.data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-56 lg:col-span-2" />
          <Skeleton className="h-56" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      </div>
    );
  }
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Hero data={d} onApply={() => setApplying(true)} />
        <NextHoliday holidays={d.upcoming_holidays} calendar={d.holiday_calendar} />
      </div>

      <section>
        <SectionTitle title="Leave balance" action={<Link to="/leaves" className="link text-sm">View details</Link>} />
        <BalanceCards balances={d.balances} />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <WeekAhead className="lg:col-span-2" />
        <Celebrations items={d.celebrations} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card title="Upcoming time off" icon={<Palmtree className="h-4 w-4" />} bodyClass="px-2 pb-2 pt-1">
          {d.upcoming_leaves.length ? (
            <RequestList rows={d.upcoming_leaves} />
          ) : (
            <EmptyState compact icon={<Palmtree className="h-6 w-6" />} title="Nothing planned yet">
              <button className="link" onClick={() => setApplying(true)}>Plan some time off</button>
            </EmptyState>
          )}
        </Card>
        <Card
          title="Recent requests"
          icon={<Clock className="h-4 w-4" />}
          className="lg:col-span-2"
          bodyClass="px-2 pb-2 pt-1"
          action={<Link to="/leaves" className="link text-sm">All requests</Link>}
        >
          {d.recent_requests.length ? <RequestList rows={d.recent_requests} showApplied /> : <EmptyState compact title="No requests yet" />}
        </Card>
      </div>
      <LeaveApplyModal open={applying} onClose={() => setApplying(false)} />
    </div>
  );
}

function Hero({ data, onApply }: { data: EmployeeDash; onApply: () => void }) {
  const me = useMe();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const status = {
    WORKING: { icon: <Briefcase className="h-3.5 w-3.5" />, text: 'Working day' },
    WFH: { icon: <Laptop className="h-3.5 w-3.5" />, text: 'Working from home today' },
    ON_LEAVE: { icon: <Palmtree className="h-3.5 w-3.5" />, text: `On leave today · ${data.today.label}` },
    HOLIDAY: { icon: <Sparkles className="h-3.5 w-3.5" />, text: `Holiday · ${data.today.label}` },
    WEEKEND: { icon: <Sun className="h-3.5 w-3.5" />, text: 'Enjoy your weekend' },
  }[data.today.kind];
  const main = data.balances.find((b) => b.applicable && !b.is_unlimited && b.is_paid);
  const pending = data.recent_requests.filter((r) => r.status === 'PENDING').length;

  const actions: { label: string; icon: ReactNode; to?: string; onClick?: () => void }[] = [
    { label: 'Apply leave', icon: <Plus className="h-5 w-5" />, onClick: onApply },
    { label: 'Work from home', icon: <Laptop className="h-5 w-5" />, to: '/wfh' },
    { label: 'Team calendar', icon: <CalendarDays className="h-5 w-5" />, to: '/calendar' },
    { label: 'Holidays', icon: <CalendarHeart className="h-5 w-5" />, to: '/holidays' },
  ];

  return (
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 p-6 text-white shadow-lift sm:p-7 lg:col-span-2">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 text-sm text-indigo-100">
          <span>{format(new Date(), 'EEEE, d MMMM')}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/20">
            {status.icon} {status.text}
          </span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-[34px]">
          {greeting}, {me.first_name}
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-indigo-100">
          {main ? (
            <>You have <strong className="font-semibold text-white">{fmtDays(main.available)}</strong> of {main.leave_type_name.toLowerCase()} left this year.</>
          ) : (
            'Welcome to your desk.'
          )}
          {pending > 0 && <> {pending} request{pending > 1 ? 's are' : ' is'} awaiting approval.</>}
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {actions.map((a) => {
            const cls = 'group flex flex-col items-start gap-3 rounded-2xl bg-white/10 p-3.5 text-left text-sm font-medium ring-1 ring-inset ring-white/15 backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/20';
            const inner = (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-brand-700 shadow-sm">{a.icon}</span>
                <span className="leading-tight">{a.label}</span>
              </>
            );
            return a.to ? (
              <Link key={a.label} to={a.to} className={cls}>{inner}</Link>
            ) : (
              <button key={a.label} onClick={a.onClick} className={cls}>{inner}</button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function NextHoliday({ holidays, calendar }: { holidays: Holiday[]; calendar: HolidayCalendarBrief | null }) {
  const [next, ...rest] = holidays;
  const inDays = next ? differenceInCalendarDays(toDate(next.date), new Date()) : 0;
  return (
    <Card
      title="Next holiday"
      subtitle={calendar ? `${calendar.name} calendar` : undefined}
      icon={<CalendarHeart className="h-4 w-4" />}
      action={<Link to="/holidays" className="link text-sm">All</Link>}
    >
      {next ? (
        <div>
          <div className="flex items-center gap-4 rounded-2xl bg-rose-50/70 p-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-rose-600 shadow-card">
              <span className="text-[11px] font-semibold uppercase leading-none">{fmtDate(next.date, 'MMM')}</span>
              <span className="font-display text-2xl font-bold leading-tight">{fmtDate(next.date, 'd')}</span>
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900">{next.name}</div>
              <div className="text-sm text-slate-600">{next.weekday}{next.is_optional ? ' · Optional' : ''}</div>
              <div className="mt-1 text-xs font-medium text-rose-600">{inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : `In ${inDays} days`}</div>
            </div>
          </div>
          {rest.length > 0 && (
            <ul className="mt-3 space-y-2">
              {rest.slice(0, 3).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700">{h.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">{fmtDate(h.date, 'EEE, d MMM')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <EmptyState compact icon={<CalendarHeart className="h-6 w-6" />} title="No upcoming holidays" />
      )}
    </Card>
  );
}

/** Next 7 days: who on my team is off or working from home. */
function WeekAhead({ className }: { className?: string }) {
  const me = useMe();
  const start = new Date();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const range = { start: isoDate(days[0]), end: isoDate(days[6]) };
  const q = useQuery({
    queryKey: ['calendar', 'week', range.start],
    queryFn: () => api.get<CalendarData>(`/calendar${qs({ ...range, scope: 'team', include_pending: false })}`),
  });
  const cal = q.data;
  // Python weekday numbers (Mon=0) -> JS getDay (Sun=0)
  const weekend = new Set((cal?.weekend_days ?? me.settings.weekend_days).map((w) => (w + 1) % 7));
  const ownHolidays = (cal?.holidays ?? []).filter((h) => !h.is_optional && h.calendar_id === me.holiday_calendar?.id);

  return (
    <Card
      title="Your team this week"
      subtitle={cal ? `${cal.members} people · who's off or working from home` : ' '}
      icon={<Users className="h-4 w-4" />}
      className={className}
      action={<Link to="/calendar" className="link text-sm">Calendar</Link>}
      bodyClass="p-4 pt-3"
    >
      {/* Seven columns don't fit on a phone: scroll the strip inside the card instead of the page. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="grid min-w-[520px] grid-cols-7 gap-1.5 sm:min-w-0 sm:gap-2">
        {days.map((day, i) => {
          const iso = isoDate(day);
          const off = cal?.leaves.filter((l) => l.start_date <= iso && l.end_date >= iso && l.employee.id !== me.id) ?? [];
          const wfh = cal?.wfh.filter((w) => w.start_date <= iso && w.end_date >= iso && w.employee.id !== me.id) ?? [];
          const holiday = ownHolidays.find((h) => h.date === iso);
          const isOff = weekend.has(day.getDay()) || !!holiday;
          return (
            <div
              key={iso}
              className={clsx(
                'flex min-h-[132px] flex-col rounded-2xl border p-2 sm:p-2.5',
                i === 0 ? 'border-brand-200 bg-brand-50/50' : isOff ? 'border-transparent bg-slate-50' : 'border-slate-200/70 bg-white',
              )}
            >
              <div className="text-center">
                <div className={clsx('text-[11px] font-semibold uppercase', i === 0 ? 'text-brand-600' : 'text-slate-400')}>{i === 0 ? 'Today' : format(day, 'EEE')}</div>
                <div className={clsx('font-display text-lg font-bold', isOff ? 'text-slate-400' : 'text-slate-800')}>{format(day, 'd')}</div>
              </div>
              <div className="mt-1.5 flex flex-1 flex-col items-center gap-1.5">
                {holiday ? (
                  <span className="line-clamp-3 text-center text-[10px] font-medium leading-tight text-rose-600" title={holiday.name}>{holiday.name}</span>
                ) : isOff ? (
                  <span className="text-[10px] text-slate-400">Weekend</span>
                ) : off.length + wfh.length === 0 ? (
                  <span className="mt-2 text-[10px] font-medium text-emerald-600">All in</span>
                ) : (
                  <>
                    {off.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5" title={off.map((l) => `${l.employee.full_name} — ${l.leave_type.name}`).join('\n')}>
                        <AvatarStack people={off.map((l) => l.employee)} max={2} size="xs" />
                        <span className="text-[10px] font-medium text-slate-500">{off.length} off</span>
                      </div>
                    )}
                    {wfh.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5" title={wfh.map((w) => `${w.employee.full_name} — WFH`).join('\n')}>
                        <AvatarStack people={wfh.map((w) => w.employee)} max={2} size="xs" />
                        <span className="text-[10px] font-medium text-sky-600">{wfh.length} WFH</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </Card>
  );
}

function Celebrations({ items }: { items: Celebration[] }) {
  return (
    <Card title="Celebrations" subtitle="Next 30 days" icon={<Cake className="h-4 w-4" />} bodyClass="px-3 pb-3 pt-1">
      {items.length ? (
        <ul className="max-h-[300px] space-y-0.5 overflow-y-auto">
          {items.slice(0, 8).map((c) => {
            const inDays = differenceInCalendarDays(toDate(c.date), new Date());
            const when = inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : fmtDate(c.date, 'EEE, d MMM');
            return (
              <li key={`${c.kind}-${c.employee.id}`}>
                <Link to={`/employees/${c.employee.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <div className="relative">
                    <Avatar person={c.employee} size="sm" />
                    <span className={clsx('absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white', c.kind === 'BIRTHDAY' ? 'bg-pink-500' : 'bg-amber-500')}>
                      {c.kind === 'BIRTHDAY' ? <Cake className="h-2.5 w-2.5 text-white" /> : <Award className="h-2.5 w-2.5 text-white" />}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{c.employee.full_name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {c.kind === 'BIRTHDAY' ? 'Birthday' : `${c.years} year${c.years === 1 ? '' : 's'} at work`}
                    </div>
                  </div>
                  <span className={clsx('shrink-0 text-xs font-medium', inDays <= 1 ? 'text-pink-600' : 'text-slate-500')}>{when}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState compact icon={<Cake className="h-6 w-6" />} title="No celebrations coming up" />
      )}
    </Card>
  );
}

/** Compact clickable request rows for dashboards. */
function RequestList({ rows, showEmployee, showApplied }: { rows: AnyRequest[]; showEmployee?: boolean; showApplied?: boolean }) {
  const [open, setOpen] = useState<{ kind: RequestKind; id: number } | null>(null);
  return (
    <>
      <ul>
        {rows.map((r) => {
          const color = r.kind === 'LEAVE' ? r.leave_type.color : '#0ea5e9';
          return (
            <li key={`${r.kind}-${r.id}`}>
              <button onClick={() => setOpen({ kind: r.kind, id: r.id })} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50">
                {showEmployee ? (
                  <Avatar person={r.employee} size="sm" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}14`, color }}>
                    {r.kind === 'WFH' ? <Laptop className="h-4 w-4" /> : <Palmtree className="h-4 w-4" />}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">
                    {showEmployee ? r.employee.full_name : requestTitle(r)}
                    {showEmployee && <span className="font-normal text-slate-500"> · {r.kind === 'LEAVE' ? r.leave_type.name : kindLabel[r.kind]}</span>}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {dateRange(r)} · {r.kind === 'LEAVE' ? durationLabel(r) : fmtDays(r.total_days)}
                    {showApplied && <> · applied {fromNow(r.applied_at)}</>}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </button>
            </li>
          );
        })}
      </ul>
      <RequestDetailModal kind={open?.kind ?? 'LEAVE'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  );
}

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
      {action}
    </div>
  );
}

/* ----------------------------------------------------------------------------- Team */

interface ManagerDash {
  team_size: number;
  direct_reports: PersonStatus[];
  availability: { available: number; on_leave: number; wfh: number };
  pending_approvals: AnyRequest[];
  pending_count: number;
  upcoming_team_leaves: LeaveRequest[];
}

const PRESENCE = {
  AVAILABLE: { label: 'In office', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  WFH: { label: 'WFH', cls: 'bg-sky-50 text-sky-700 ring-sky-600/15', dot: 'bg-sky-500' },
  ON_LEAVE: { label: 'On leave', cls: 'bg-amber-50 text-amber-700 ring-amber-600/15', dot: 'bg-amber-500' },
} as const;

function TeamView() {
  const q = useQuery({ queryKey: ['dashboard', 'manager'], queryFn: () => api.get<ManagerDash>('/dashboard/manager') });
  if (!q.data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Team size" value={d.team_size} icon={<Users className="h-5 w-5" />} hint="including indirect reports" />
        <StatCard label="In office today" value={d.availability.available} icon={<UserCheck className="h-5 w-5" />} tone="emerald" hint="direct reports" />
        <StatCard label="Out today" value={`${d.availability.on_leave} · ${d.availability.wfh}`} icon={<Home className="h-5 w-5" />} tone="sky" hint="on leave · working from home" />
        <StatCard label="Awaiting you" value={d.pending_count} icon={<Clock className="h-5 w-5" />} tone="amber" hint="pending approvals" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card
          title="Pending approvals"
          icon={<Clock className="h-4 w-4" />}
          className="lg:col-span-2"
          bodyClass="px-2 pb-2 pt-1"
          action={<Link to="/approvals" className="link inline-flex items-center gap-1 text-sm">Review all <ArrowRight className="h-3.5 w-3.5" /></Link>}
        >
          {d.pending_approvals.length ? (
            <RequestList rows={d.pending_approvals} showEmployee showApplied />
          ) : (
            <EmptyState compact icon={<CalendarCheck className="h-6 w-6" />} title="You're all caught up" />
          )}
        </Card>
        <Card title="Direct reports today" icon={<UserCheck className="h-4 w-4" />} bodyClass="px-3 pb-3 pt-1">
          <ul className="space-y-0.5">
            {d.direct_reports.map((p) => {
              const s = PRESENCE[p.presence];
              return (
                <li key={p.id}>
                  <Link to={`/employees/${p.id}`} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2 hover:bg-slate-50">
                    <PersonCell person={p} />
                    <Badge className={s.cls}>
                      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
                      {p.presence === 'ON_LEAVE' ? p.label : s.label}
                    </Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card
        title="Team time off · next 2 weeks"
        icon={<Palmtree className="h-4 w-4" />}
        bodyClass="px-2 pb-2 pt-1"
        action={<Link to="/calendar" className="link text-sm">Calendar</Link>}
      >
        {d.upcoming_team_leaves.length ? (
          <RequestList rows={d.upcoming_team_leaves} showEmployee />
        ) : (
          <EmptyState compact title="No team leave in the next two weeks" />
        )}
      </Card>
    </div>
  );
}

/* ----------------------------------------------------------------------------- Organization */

interface AdminDash {
  headcount: number;
  departments: number;
  by_department: { name: string; count: number }[];
  new_joiners: EmployeeBrief[];
  on_leave_today: PersonStatus[];
  wfh_today: PersonStatus[];
  pending: Record<string, number>;
  pending_total: number;
  leave_by_type: { id: number; code: string; name: string; color: string; country_codes: string[]; days: number }[];
  leave_by_month: { month: number; days: number }[];
  upcoming_holidays: Holiday[];
  recent_activity: { id: number; actor: EmployeeBrief | null; entity: string; action: string; created_at: string }[];
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function OrgView() {
  const q = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: () => api.get<AdminDash>('/dashboard/admin') });
  if (!q.data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  const d = q.data;
  const out = [...d.on_leave_today, ...d.wfh_today];
  const ytd = d.leave_by_month.reduce((s, m) => s + m.days, 0);
  const busiest = d.leave_by_month.reduce((a, b) => (b.days > a.days ? b : a), d.leave_by_month[0]);
  const used = d.leave_by_type.filter((t) => t.days > 0);
  const unused = d.leave_by_type.length - used.length;
  const year = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={d.headcount} icon={<Users className="h-5 w-5" />} hint={`${d.departments} departments`} />
        <StatCard label="On leave today" value={d.on_leave_today.length} icon={<Palmtree className="h-5 w-5" />} tone="amber" />
        <StatCard label="WFH today" value={d.wfh_today.length} icon={<Laptop className="h-5 w-5" />} tone="sky" />
        <StatCard label="Pending requests" value={d.pending_total} icon={<Clock className="h-5 w-5" />} tone="rose" hint={`${d.pending.leave} leave · ${d.pending.wfh} WFH`} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card title="Leave taken by month" subtitle={`Approved days, ${year}`} icon={<CalendarDays className="h-4 w-4" />} className="lg:col-span-2">
          <div className="mb-5 flex flex-wrap gap-x-8 gap-y-2">
            <Kpi label="Days taken so far" value={Math.round(ytd * 10) / 10} />
            <Kpi label="Per employee" value={d.headcount ? Math.round((ytd / d.headcount) * 10) / 10 : 0} />
            {busiest && busiest.days > 0 && <Kpi label="Busiest month" value={MONTH_NAMES[busiest.month - 1]} />}
          </div>
          <ColumnChart
            data={d.leave_by_month.map((m) => ({ key: String(m.month), label: MONTH_NAMES[m.month - 1].slice(0, 3), title: MONTH_NAMES[m.month - 1], value: m.days }))}
          />
        </Card>
        <Card title="By leave type" subtitle="Each country's policy is counted separately" icon={<Sparkles className="h-4 w-4" />}>
          {used.length ? (
            <BarList
              unit="days"
              data={used.map((t) => ({
                key: String(t.id),
                dot: t.color,
                value: t.days,
                label: (
                  <>
                    <span className="truncate">{t.name}</span>
                    {t.country_codes.map((c) => <CountryTag key={c} code={c} />)}
                  </>
                ),
              }))}
            />
          ) : (
            <EmptyState compact title="No leave taken yet this year" />
          )}
          {unused > 0 && <p className="mt-4 text-xs text-slate-400">{unused} other leave type{unused > 1 ? 's have' : ' has'} no days taken yet.</p>}
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card title="Out of office today" icon={<Home className="h-4 w-4" />} bodyClass="px-3 pb-3 pt-1">
          {out.length ? (
            <ul className="space-y-0.5">
              {out.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2">
                  <PersonCell person={p} sub={p.department ?? undefined} />
                  <Badge color={p.color}>{p.presence === 'WFH' ? 'WFH' : p.label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<UserCheck className="h-6 w-6" />} title="Everyone is in today" />
          )}
        </Card>
        <Card title="Headcount by department" icon={<Briefcase className="h-4 w-4" />}>
          <BarList data={d.by_department.map((x) => ({ key: x.name, label: x.name, value: x.count }))} />
        </Card>
        <Card title="Upcoming holidays" subtitle="All country calendars" icon={<CalendarHeart className="h-4 w-4" />} action={<Link to="/holidays" className="link text-sm">All</Link>} bodyClass="px-3 pb-3 pt-1">
          <ul className="space-y-0.5">
            {d.upcoming_holidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <span className="text-[9px] font-semibold uppercase leading-none">{fmtDate(h.date, 'MMM')}</span>
                  <span className="font-display text-sm font-bold leading-tight">{fmtDate(h.date, 'd')}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{h.name}</div>
                  <div className="text-xs text-slate-500">{h.weekday}{h.is_optional ? ' · Optional' : ''}</div>
                </div>
                <CountryTag code={h.country_code} title={h.calendar_name ?? undefined} />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Recent joiners" subtitle="Last 60 days" icon={<UserCheck className="h-4 w-4" />} bodyClass="px-3 pb-3 pt-1">
          {d.new_joiners.length ? (
            <ul className="space-y-0.5">
              {d.new_joiners.map((e) => (
                <li key={e.id}>
                  <Link to={`/employees/${e.id}`} className="block rounded-xl px-2 py-2 hover:bg-slate-50"><PersonCell person={e} sub={`${e.designation} · ${e.department}`} /></Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No new joiners in the last 60 days" />
          )}
        </Card>
        <Card title="Recent admin activity" icon={<Clock className="h-4 w-4" />} action={<Link to="/admin/audit" className="link text-sm">Audit log</Link>} bodyClass="px-3 pb-3 pt-1">
          {d.recent_activity.length ? (
            <ul className="space-y-0.5">
              {d.recent_activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm">
                  {a.actor ? <Avatar person={a.actor} size="sm" /> : <IconBubble tone="violet" className="h-8 w-8"><Sparkles className="h-4 w-4" /></IconBubble>}
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-900">{a.actor?.full_name ?? 'System'}</span>{' '}
                    <span className="text-slate-600">{titleCase(a.action).toLowerCase()} {a.entity.replace(/_/g, ' ')}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{fromNow(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No activity yet" />
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="font-display text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
