import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarHeart, Clock, Home, Laptop, Plus, UserCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarList, ColumnChart } from '../components/BarChart';
import BalanceCards from '../components/BalanceCards';
import LeaveApplyModal from '../components/LeaveApplyModal';
import RequestTable from '../components/RequestTable';
import { Avatar, Badge, Button, Card, CountryTag, EmptyState, PageHeader, PersonCell, Spinner, StatCard, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { dateRange, fmtDate, fromNow, titleCase } from '../lib/format';
import type { AnyRequest, Balance, EmployeeBrief, Holiday, LeaveRequest, PersonStatus } from '../lib/types';

type Tab = 'me' | 'team' | 'org';

export default function Dashboard() {
  const me = useMe();
  const tabs: { value: Tab; label: string }[] = [{ value: 'me', label: 'My dashboard' }];
  if (me.is_manager) tabs.push({ value: 'team', label: 'My team' });
  if (me.is_hr) tabs.push({ value: 'org', label: 'Organization' });
  const [tab, setTab] = useState<Tab>(me.is_hr ? 'org' : me.is_manager ? 'team' : 'me');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greeting}, ${me.first_name}`} subtitle={fmtDate(new Date().toISOString(), 'EEEE, dd MMMM yyyy')} />
      {tabs.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} />}
      {tab === 'me' && <EmployeeDashboard />}
      {tab === 'team' && <ManagerDashboard />}
      {tab === 'org' && <AdminDashboard />}
    </div>
  );
}

interface EmployeeDash {
  balances: Balance[];
  upcoming_leaves: LeaveRequest[];
  upcoming_holidays: Holiday[];
  recent_requests: AnyRequest[];
  team_out_today: PersonStatus[];
}

function EmployeeDashboard() {
  const [applying, setApplying] = useState(false);
  const q = useQuery({ queryKey: ['dashboard', 'employee'], queryFn: () => api.get<EmployeeDash>('/dashboard/employee') });
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setApplying(true)}><Plus className="h-4 w-4" /> Apply leave</Button>
        <Link to="/wfh"><Button variant="secondary"><Laptop className="h-4 w-4" /> Request WFH</Button></Link>
        <Link to="/calendar"><Button variant="secondary"><CalendarCheck className="h-4 w-4" /> Team calendar</Button></Link>
      </div>
      <BalanceCards balances={d.balances} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Upcoming leave" className="lg:col-span-2" bodyClass="p-0">
          {d.upcoming_leaves.length ? (
            <ul className="divide-y divide-slate-100">
              {d.upcoming_leaves.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-1 rounded-full" style={{ backgroundColor: l.leave_type.color }} />
                    <div>
                      <div className="text-sm font-medium text-slate-900">{dateRange(l)}</div>
                      <div className="text-xs text-slate-500">{l.leave_type.name} · {l.total_days} day(s)</div>
                    </div>
                  </div>
                  <Badge className={l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}>
                    {titleCase(l.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarCheck className="h-8 w-8" />} title="No upcoming leave">Time for a break? Plan one ahead.</EmptyState>
          )}
        </Card>
        <HolidayList holidays={d.upcoming_holidays} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Recent requests" className="lg:col-span-2" bodyClass="p-0">
          <RequestTable rows={d.recent_requests} />
        </Card>
        <Card title="Team — out today">
          {d.team_out_today.length ? (
            <ul className="space-y-3">
              {d.team_out_today.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <PersonCell person={p} />
                  <Badge color={p.color}>{p.presence === 'WFH' ? 'WFH' : p.label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<UserCheck className="h-8 w-8" />} title="Everyone's in today" />
          )}
        </Card>
      </div>
      <LeaveApplyModal open={applying} onClose={() => setApplying(false)} />
    </div>
  );
}

function HolidayList({ holidays, showCountry }: { holidays: Holiday[]; showCountry?: boolean }) {
  return (
    <Card title={showCountry ? 'Upcoming holidays (all countries)' : 'Upcoming holidays'} action={<Link to="/holidays" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>}>
      {holidays.length ? (
        <ul className="space-y-3">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                <span className="text-[10px] font-semibold uppercase leading-none">{fmtDate(h.date, 'MMM')}</span>
                <span className="text-base font-bold leading-tight">{fmtDate(h.date, 'd')}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                  {showCountry && <CountryTag code={h.country_code} title={h.calendar_name ?? undefined} />}
                  <span className="truncate">{h.name}</span>
                </div>
                <div className="text-xs text-slate-500">{h.weekday}{h.is_optional ? ' · Optional' : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarHeart className="h-8 w-8" />} title="No upcoming holidays" />
      )}
    </Card>
  );
}

interface ManagerDash {
  team_size: number;
  direct_reports: PersonStatus[];
  availability: { available: number; on_leave: number; wfh: number };
  pending_approvals: AnyRequest[];
  pending_count: number;
  upcoming_team_leaves: LeaveRequest[];
}

function ManagerDashboard() {
  const q = useQuery({ queryKey: ['dashboard', 'manager'], queryFn: () => api.get<ManagerDash>('/dashboard/manager') });
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Team size" value={d.team_size} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Available" value={d.availability.available} icon={<UserCheck className="h-5 w-5" />} tone="emerald" hint="direct reports" />
        <StatCard label="On leave / WFH" value={`${d.availability.on_leave} / ${d.availability.wfh}`} icon={<Home className="h-5 w-5" />} tone="sky" />
        <StatCard label="Pending approvals" value={d.pending_count} icon={<Clock className="h-5 w-5" />} tone="amber" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Pending approvals"
          className="lg:col-span-2"
          bodyClass="p-0"
          action={<Link to="/approvals" className="text-xs font-medium text-brand-600 hover:underline">Open approvals</Link>}
        >
          <RequestTable rows={d.pending_approvals} showEmployee empty="You're all caught up" />
        </Card>
        <Card title="Team availability today">
          <ul className="space-y-3">
            {d.direct_reports.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2">
                <Link to={`/employees/${p.id}`}><PersonCell person={p} /></Link>
                <Badge color={p.color}>{p.presence === 'AVAILABLE' ? 'In office' : p.presence === 'WFH' ? 'WFH' : p.label}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Team leave — next 2 weeks" bodyClass="p-0" action={<Link to="/calendar" className="text-xs font-medium text-brand-600 hover:underline">Calendar</Link>}>
        <RequestTable rows={d.upcoming_team_leaves} showEmployee empty="No team leave in the next two weeks" />
      </Card>
    </div>
  );
}

interface AdminDash {
  headcount: number;
  departments: number;
  by_department: { name: string; count: number }[];
  new_joiners: EmployeeBrief[];
  on_leave_today: PersonStatus[];
  wfh_today: PersonStatus[];
  pending: Record<string, number>;
  pending_total: number;
  leave_by_type: { name: string; color: string; days: number }[];
  leave_by_month: { month: number; days: number }[];
  upcoming_holidays: Holiday[];
  recent_activity: { id: number; actor: EmployeeBrief | null; entity: string; action: string; created_at: string }[];
}

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function AdminDashboard() {
  const q = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: () => api.get<AdminDash>('/dashboard/admin') });
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const out = [...d.on_leave_today, ...d.wfh_today];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Employees" value={d.headcount} icon={<Users className="h-5 w-5" />} hint={`${d.departments} departments`} />
        <StatCard label="On leave today" value={d.on_leave_today.length} icon={<CalendarCheck className="h-5 w-5" />} tone="rose" />
        <StatCard label="WFH today" value={d.wfh_today.length} icon={<Laptop className="h-5 w-5" />} tone="sky" />
        <StatCard
          label="Pending requests"
          value={d.pending_total}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
          hint={`${d.pending.leave} leave · ${d.pending.wfh} WFH`}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Leave days taken by month (${new Date().getFullYear()})`} className="lg:col-span-2">
          <ColumnChart data={d.leave_by_month.map((m) => ({ label: MONTHS[m.month - 1], value: m.days }))} />
        </Card>
        <Card title="Leave days by type">
          <BarList data={d.leave_by_type.map((t) => ({ label: t.name, value: t.days, dot: t.color }))} unit="days" />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Headcount by department">
          <BarList data={d.by_department.map((x) => ({ label: x.name, value: x.count }))} />
        </Card>
        <Card title="Out of office today">
          {out.length ? (
            <ul className="space-y-3">
              {out.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <PersonCell person={p} sub={p.department ?? undefined} />
                  <Badge color={p.color}>{p.presence === 'WFH' ? 'WFH' : p.label}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Everyone is in the office" />
          )}
        </Card>
        <HolidayList holidays={d.upcoming_holidays} showCountry />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Recent joiners">
          {d.new_joiners.length ? (
            <ul className="space-y-3">
              {d.new_joiners.map((e) => (
                <li key={e.id}>
                  <Link to={`/employees/${e.id}`}><PersonCell person={e} sub={`${e.designation} · ${e.department}`} /></Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No new joiners in the last 60 days" />
          )}
        </Card>
        <Card title="Recent admin activity" action={<Link to="/admin/audit" className="text-xs font-medium text-brand-600 hover:underline">Audit log</Link>}>
          {d.recent_activity.length ? (
            <ul className="space-y-3">
              {d.recent_activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  {a.actor ? <Avatar person={a.actor} size="sm" /> : <span className="h-7 w-7 rounded-full bg-slate-200" />}
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-slate-900">{a.actor?.full_name ?? 'System'}</span>{' '}
                    <span className="text-slate-600">{titleCase(a.action).toLowerCase()} {a.entity.replace('_', ' ')}</span>
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{fromNow(a.created_at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No activity yet" />
          )}
        </Card>
      </div>
    </div>
  );
}

