import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CountryTag, EmptyState, ErrorNote, Field, Modal, PageHeader, Spinner, Tabs, Toggle } from '../components/ui';
import { api, qs } from '../lib/api';
import { useMe } from '../lib/auth';
import { COUNTRIES, countryName } from '../lib/countries';
import { fmtDate, isoDate, WEEKDAYS } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Holiday, HolidayCalendar } from '../lib/types';

type Tab = 'holidays' | 'calendars';

const weekendLabel = (days: number[] | null | undefined) =>
  days && days.length ? days.map((d) => WEEKDAYS[d].slice(0, 3)).join(' & ') : 'Company default';

export default function Holidays() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('holidays');
  return (
    <div className="space-y-6">
      <PageHeader title="Holiday calendars" subtitle="Each country has its own holidays and weekend. Your calendar is chosen from your country." />
      {me.is_hr && (
        <Tabs tabs={[{ value: 'holidays', label: 'Holidays' }, { value: 'calendars', label: 'Calendars & countries' }]} value={tab} onChange={setTab} />
      )}
      {tab === 'holidays' ? <HolidayList /> : <CalendarAdmin />}
    </div>
  );
}

function HolidayList() {
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const today = isoDate(new Date());
  const [year, setYear] = useState(thisYear);
  const myCalendarId = me.holiday_calendar?.id ?? null;
  const [calendarId, setCalendarId] = useState<number | null>(myCalendarId);
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);

  const cals = useQuery({ queryKey: ['holiday-calendars'], queryFn: () => api.get<HolidayCalendar[]>('/holiday-calendars') });
  const selectedId = calendarId ?? myCalendarId ?? cals.data?.[0]?.id ?? null;
  const selected = cals.data?.find((c) => c.id === selectedId);
  const isMine = selectedId === myCalendarId;

  const q = useQuery({
    queryKey: ['holidays', year, selectedId],
    queryFn: () => api.get<Holiday[]>(`/holidays${qs({ year, calendar_id: selectedId })}`),
    enabled: selectedId !== null,
  });
  const optIn = useMutation({
    mutationFn: (h: Holiday) => (h.opted_in ? api.del(`/holidays/${h.id}/opt-in`) : api.post(`/holidays/${h.id}/opt-in`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['holidays'] }),
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (h: Holiday) => api.del(`/holidays/${h.id}`),
    onSuccess: () => {
      toast.success('Holiday deleted');
      void qc.invalidateQueries({ queryKey: ['holidays'] });
    },
    onError: toast.error,
  });

  const mandatory = q.data?.filter((h) => !h.is_optional) ?? [];
  const optional = q.data?.filter((h) => h.is_optional) ?? [];
  const chosen = optional.filter((h) => h.opted_in).length;

  const row = (h: Holiday) => (
    <li key={h.id} className={clsx('flex items-center gap-4 px-5 py-3', h.date < today && 'opacity-60')}>
      <div className={clsx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg', h.is_optional ? 'bg-violet-50 text-violet-700' : 'bg-rose-50 text-rose-700')}>
        <span className="text-[10px] font-semibold uppercase leading-none">{fmtDate(h.date, 'MMM')}</span>
        <span className="text-lg font-bold leading-tight">{fmtDate(h.date, 'd')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-slate-900">{h.name}</div>
        <div className="text-xs text-slate-500">{h.weekday}{h.description ? ` · ${h.description}` : ''}</div>
      </div>
      {h.is_optional && isMine && (
        <Button size="sm" variant={h.opted_in ? 'success' : 'secondary'} disabled={h.date < today || optIn.isPending} onClick={() => optIn.mutate(h)}>
          {h.opted_in ? 'Opted in ✓' : 'Opt in'}
        </Button>
      )}
      {me.is_hr && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(h)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${h.name}?`) && remove.mutate(h)} aria-label="Delete"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={selectedId ?? ''} onChange={(e) => setCalendarId(Number(e.target.value))}>
          {cals.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.id === myCalendarId ? ' (my calendar)' : ''}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {selected && (
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <CountryTag code={selected.country_code} title={countryName(selected.country_code)} />
            Weekend: {weekendLabel(selected.weekend_days ?? me.settings.weekend_days)}
          </span>
        )}
        <div className="flex-1" />
        {me.is_hr && selectedId && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add holiday</Button>}
      </div>
      {!isMine && selected && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          You're viewing the <strong>{selected.name}</strong> calendar. Your leave follows <strong>{me.holiday_calendar?.name ?? 'the default calendar'}</strong>.
        </p>
      )}
      {q.isLoading || cals.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`Holidays · ${mandatory.length}`} bodyClass="p-0">
            {mandatory.length ? <ul className="divide-y divide-slate-100">{mandatory.map(row)}</ul> : <EmptyState title={`No holidays in ${year}`} />}
          </Card>
          <Card
            title="Optional holidays"
            action={isMine ? <Badge>{chosen} / {me.settings.max_optional_holidays} chosen</Badge> : undefined}
            bodyClass="p-0"
          >
            {optional.length ? <ul className="divide-y divide-slate-100">{optional.map(row)}</ul> : <EmptyState title="No optional holidays" />}
          </Card>
        </div>
      )}
      <HolidayModal holiday={editing} onClose={() => setEditing(null)} defaultYear={year} calendarId={selectedId} calendars={cals.data ?? []} />
    </>
  );
}

function HolidayModal({ holiday, onClose, defaultYear, calendarId, calendars }: {
  holiday: Holiday | 'new' | null;
  onClose: () => void;
  defaultYear: number;
  calendarId: number | null;
  calendars: HolidayCalendar[];
}) {
  const existing = holiday && holiday !== 'new' ? holiday : null;
  const blank = { calendar_id: calendarId, name: '', date: `${defaultYear}-01-01`, is_optional: false, description: '' };
  const [form, setForm] = useState(blank);
  useEffect(() => {
    if (!holiday) return;
    setForm(existing ? { calendar_id: existing.calendar_id, name: existing.name, date: existing.date, is_optional: existing.is_optional, description: existing.description ?? '' } : blank);
  }, [holiday]);
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const body = { ...form, description: form.description || null };
      return existing ? api.put(`/holidays/${existing.id}`, body) : api.post('/holidays', body);
    },
    onSuccess: () => {
      toast.success('Holiday saved');
      void qc.invalidateQueries({ queryKey: ['holidays'] });
      void qc.invalidateQueries({ queryKey: ['holiday-calendars'] });
      onClose();
    },
  });
  return (
    <Modal
      open={!!holiday}
      onClose={onClose}
      title={existing ? 'Edit holiday' : 'Add holiday'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} onClick={() => m.mutate()} disabled={!form.name}>Save</Button></>}
    >
      <div className="space-y-4">
        <Field label="Calendar">
          <select className="input" value={form.calendar_id ?? ''} onChange={(e) => setForm({ ...form, calendar_id: Number(e.target.value) })}>
            {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Toggle label="Optional holiday (employees opt in)" checked={form.is_optional} onChange={(v) => setForm({ ...form, is_optional: v })} />
        <ErrorNote error={m.error} />
      </div>
    </Modal>
  );
}

function CalendarAdmin() {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<HolidayCalendar | 'new' | null>(null);
  const cals = useQuery({ queryKey: ['holiday-calendars'], queryFn: () => api.get<HolidayCalendar[]>('/holiday-calendars') });
  const remove = useMutation({
    mutationFn: (c: HolidayCalendar) => api.del(`/holiday-calendars/${c.id}`),
    onSuccess: () => {
      toast.success('Calendar deleted');
      void qc.invalidateQueries({ queryKey: ['holiday-calendars'] });
    },
    onError: toast.error,
  });

  return (
    <>
      <p className="text-sm text-slate-600">
        Employees get the calendar that matches their <strong>country</strong> (set under Admin → Employees). HR can also pin a specific calendar on an employee.
        Anyone without a match uses the <strong>default</strong> calendar.
      </p>
      <Card title="Calendars" action={<Button size="sm" onClick={() => setEditing('new')}><Plus className="h-3.5 w-3.5" /> Add calendar</Button>} bodyClass="p-0">
        {cals.isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">Calendar</th>
                  <th className="table-th">Country</th>
                  <th className="table-th">Weekend</th>
                  <th className="table-th text-right">Holidays ({new Date().getFullYear()})</th>
                  <th className="table-th text-right">Employees</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cals.data?.map((c) => (
                  <tr key={c.id}>
                    <td className="table-td">
                      <div className="flex items-center gap-2 font-medium text-slate-900">
                        {c.name}
                        {c.is_default && <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20"><Star className="h-3 w-3" /> Default</Badge>}
                      </div>
                      {c.description && <div className="text-xs text-slate-500">{c.description}</div>}
                    </td>
                    <td className="table-td"><span className="flex items-center gap-2"><CountryTag code={c.country_code} />{countryName(c.country_code)}</span></td>
                    <td className="table-td">{weekendLabel(c.weekend_days)}</td>
                    <td className="table-td text-right tabular-nums">{c.holiday_count}</td>
                    <td className="table-td text-right tabular-nums">{c.employee_count}</td>
                    <td className="table-td whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      {!c.is_default && (
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Delete the ${c.name} calendar and all its holidays?`) && remove.mutate(c)} aria-label="Delete">
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CalendarModal value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function CalendarModal({ value, onClose }: { value: HolidayCalendar | 'new' | null; onClose: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const blank = { name: '', country_code: '', description: '', weekend_days: [5, 6] as number[] | null, is_default: false };
  const [f, setF] = useState(blank);
  useEffect(() => {
    if (!value) return;
    setF(existing ? { name: existing.name, country_code: existing.country_code ?? '', description: existing.description ?? '', weekend_days: existing.weekend_days, is_default: existing.is_default } : blank);
  }, [value]);
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => {
      const body = { ...f, country_code: f.country_code || null, description: f.description || null };
      return existing ? api.put(`/holiday-calendars/${existing.id}`, body) : api.post('/holiday-calendars', body);
    },
    onSuccess: () => {
      toast.success('Calendar saved');
      void qc.invalidateQueries();
      onClose();
    },
  });
  const days = f.weekend_days ?? [];
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={existing ? `Edit ${existing.name}` : 'Add holiday calendar'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={m.isPending} disabled={!f.name} onClick={() => m.mutate()}>Save</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Israel" /></Field>
          <Field label="Country">
            <select className="input" value={f.country_code} onChange={(e) => setF({ ...f, country_code: e.target.value })}>
              <option value="">— None —</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div>
          <span className="label">Weekend days</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d, i) => {
              const on = days.includes(i);
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => setF({ ...f, weekend_days: on ? days.filter((x) => x !== i) : [...days, i].sort() })}
                  className={clsx('rounded-lg border px-3 py-1.5 text-sm', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}
                >
                  {d.slice(0, 3)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">Israel typically uses Fri & Sat; India and Ukraine use Sat & Sun.</p>
        </div>
        <Toggle label="Default calendar (for employees without a matching country)" checked={f.is_default} onChange={(v) => setF({ ...f, is_default: v })} />
        <ErrorNote error={m.error} />
      </div>
    </Modal>
  );
}
