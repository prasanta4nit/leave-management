import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Play, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorNote, Field, PageHeader, Spinner, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth, useMe } from '../../lib/auth';
import { WEEKDAYS } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Settings } from '../../lib/types';

const FLOWS = [
  { value: 'MANAGER', label: 'Reporting manager' },
  { value: 'MANAGER_THEN_HR', label: 'Manager, then HR (two-level)' },
  { value: 'HR', label: 'HR only' },
];

export default function SettingsPage() {
  const me = useMe();
  const { refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/admin/settings') });
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    if (q.data) setS(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.put<Settings>('/admin/settings', { values: s }),
    onSuccess: async () => {
      toast.success('Settings saved');
      void qc.invalidateQueries({ queryKey: ['settings'] });
      await refresh();
    },
  });
  const job = useMutation({
    mutationFn: (name: string) => api.post<Record<string, unknown>>(`/admin/jobs/${name}`),
    onSuccess: (r) => toast.success(`Job finished: ${JSON.stringify(r)}`),
    onError: toast.error,
  });

  if (!s) return <Spinner />;
  const readOnly = !me.is_admin;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" />}
        title="System settings"
        subtitle={readOnly ? 'Read-only — only Admins can change settings' : 'Company, work week, approval workflow and notifications'}
        actions={!readOnly && <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>}
      />
      <ErrorNote error={save.error} />
      <fieldset disabled={readOnly} className="grid items-start gap-6 lg:grid-cols-2">
        <Card title="Company & work week">
          <div className="space-y-4">
            <Field label="Company name"><input className="input" value={s.company_name} onChange={(e) => set('company_name', e.target.value)} /></Field>
            <Field label="Timezone"><input className="input" value={s.timezone} onChange={(e) => set('timezone', e.target.value)} /></Field>
            <div>
              <span className="label">Default weekend days</span>
              <p className="mb-2 text-xs text-slate-500">Used by holiday calendars that don't set their own weekend (Holidays → Calendars).</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => {
                  const on = s.weekend_days.includes(i);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => set('weekend_days', on ? s.weekend_days.filter((x) => x !== i) : [...s.weekend_days, i].sort())}
                      className={clsx('rounded-lg border px-3 py-1.5 text-sm', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}
                    >
                      {d.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Approval workflow">
          <div className="space-y-4">
            {([['leave_approval_flow', 'Leave requests'], ['wfh_approval_flow', 'Work-from-home requests']] as const).map(([k, label]) => (
              <Field key={k} label={label}>
                <select className="input" value={s[k]} onChange={(e) => set(k, e.target.value)}>
                  {FLOWS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Field>
            ))}
            <Toggle label="Auto-approve when there is no other approver (e.g. the CEO)" checked={s.auto_approve_when_no_approver} onChange={(v) => set('auto_approve_when_no_approver', v)} />
            <p className="text-xs text-slate-500">Employees without a reporting manager are routed to HR. HR/Admin can always override any decision.</p>
          </div>
        </Card>

        <Card title="Policies">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Optional holidays per year"><input type="number" min={0} className="input" value={s.max_optional_holidays} onChange={(e) => set('max_optional_holidays', Number(e.target.value))} /></Field>
            <Field label="Max WFH days per month" hint="0 = no limit"><input type="number" min={0} className="input" value={s.max_wfh_days_per_month} onChange={(e) => set('max_wfh_days_per_month', Number(e.target.value))} /></Field>
          </div>
        </Card>

        <Card title="Notifications (Amazon SES)">
          <div className="space-y-4">
            <Field label="Send approval reminders after (hours)"><input type="number" min={1} className="input" value={s.reminder_after_hours} onChange={(e) => set('reminder_after_hours', Number(e.target.value))} /></Field>
            <Toggle label="CC HR on every leave application" checked={s.notify_hr_on_leave} onChange={(v) => set('notify_hr_on_leave', v)} />
            <Toggle
              label="Show birthdays and work anniversaries on the home page"
              checked={s.show_celebrations}
              onChange={(v) => set('show_celebrations', v)}
            />
            <p className="text-xs text-slate-500">Birthdays show the day and month only — never the year or age.</p>
          </div>
        </Card>
      </fieldset>

      {me.is_admin && (
        <Card title="Maintenance jobs">
          <p className="mb-4 text-sm text-slate-600">These run automatically on a schedule (EventBridge). Run them manually if needed.</p>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ['accrual', 'Run leave accrual', 'Credit monthly/quarterly accruals and create missing balances.'],
              ['reminders', 'Send approval reminders', 'Email approvers about requests pending too long.'],
              ['year-end', 'Recalculate carry-forward', 'Recompute carry-forward into the current year from last year’s usage.'],
            ].map(([name, label, desc]) => (
              <div key={name} className="rounded-lg border border-slate-200 p-4">
                <div className="font-medium text-slate-900">{label}</div>
                <p className="mb-3 mt-1 text-xs text-slate-500">{desc}</p>
                <Button size="sm" variant="secondary" loading={job.isPending && job.variables === name} onClick={() => job.mutate(name)}>
                  <Play className="h-3.5 w-3.5" /> Run now
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
