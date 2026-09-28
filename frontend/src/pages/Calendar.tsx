import { useQuery } from '@tanstack/react-query';
import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import LeaveApplyModal from '../components/LeaveApplyModal';
import MonthCalendar from '../components/MonthCalendar';
import { Button, Card, PageHeader } from '../components/ui';
import { api, qs } from '../lib/api';
import { useMe } from '../lib/auth';
import { isoDate } from '../lib/format';
import type { CalendarData, Department, LeaveType } from '../lib/types';

export default function CalendarPage() {
  const me = useMe();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [scope, setScope] = useState<'team' | 'department' | 'company' | 'me'>('team');
  const [dept, setDept] = useState<number | ''>('');
  const [pending, setPending] = useState(true);
  const [applyDate, setApplyDate] = useState<string | null>(null);

  const start = isoDate(startOfWeek(startOfMonth(month), { weekStartsOn: 1 }));
  const end = isoDate(endOfWeek(endOfMonth(month), { weekStartsOn: 1 }));
  const cal = useQuery({
    queryKey: ['calendar', start, end, scope, dept, pending],
    queryFn: () => api.get<CalendarData>(`/calendar${qs({ start, end, scope, department_id: dept, include_pending: pending })}`),
  });
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments'), enabled: scope === 'department' });
  const types = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get<LeaveType[]>('/leave-types') });

  return (
    <div>
      <PageHeader icon={<CalendarDays className="h-5 w-5" />} title="Team calendar" subtitle="Who's out, holidays and weekends at a glance. Click a day to apply for leave." />
      <Card bodyClass="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMonth(subMonths(month, 1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
            <h2 className="min-w-[150px] text-center text-base font-semibold">{format(month, 'MMMM yyyy')}</h2>
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="input w-auto py-1.5" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="me">Only me</option>
              <option value="team">My team</option>
              <option value="department">Department</option>
              <option value="company">Whole company</option>
            </select>
            {scope === 'department' && (
              <select className="input w-auto py-1.5" value={dept} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : '')}>
                <option value="">{me.department ?? 'My department'}</option>
                {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={pending} onChange={(e) => setPending(e.target.checked)} className="rounded border-slate-300" />
              Show pending
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <MonthCalendar month={month} data={cal.data} onDayClick={setApplyDate} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
          {types.data?.filter((t, i, all) => all.findIndex((x) => x.name === t.name && x.color === t.color) === i).map((t) => (
            <span key={t.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: t.color }} />{t.name}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" />WFH</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-rose-200" />Holiday</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-slate-500" />Pending / optional</span>
        </div>
      </Card>
      <LeaveApplyModal open={!!applyDate} defaultDate={applyDate ?? undefined} onClose={() => setApplyDate(null)} />
    </div>
  );
}
