import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Badge, Button, Card, CountryTag, ErrorNote, Field, Modal, PageHeader, Spinner, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { COUNTRIES, countryName } from '../../lib/countries';
import { titleCase } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { LeaveType } from '../../lib/types';

const BLANK: Omit<LeaveType, 'id'> = {
  code: '', name: '', description: '', color: '#6366f1', is_paid: true, is_unlimited: false, annual_quota: 12,
  accrual_frequency: 'YEARLY', prorate_on_joining: true, carry_forward_enabled: false, max_carry_forward: 0,
  allow_half_day: true, allow_negative_balance: false, allow_backdated: false, min_notice_days: 0,
  max_consecutive_days: null, country_codes: [], is_active: true, sort_order: 10,
};

export default function LeaveTypes() {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null);
  const [country, setCountry] = useState('');
  const q = useQuery({ queryKey: ['leave-types', 'all'], queryFn: () => api.get<LeaveType[]>('/leave-types?include_inactive=true') });
  const remove = useMutation({
    mutationFn: (t: LeaveType) => api.del<{ action: string }>(`/leave-types/${t.id}`),
    onSuccess: (r) => {
      toast.success(r.action === 'DEACTIVATE' ? 'Leave type is in use, so it was deactivated' : 'Leave type deleted');
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  return (
    <div>
      <PageHeader
        icon={<SlidersHorizontal className="h-5 w-5" />}
        title="Leave types & policies"
        subtitle="Each leave type applies to specific countries (or all). Employees only see the types for their country."
        actions={
          <>
            <select className="input w-auto" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add leave type</Button>
          </>
        }
      />
      {q.isLoading ? <Spinner /> : (
        <Card bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">Leave type</th>
                  <th className="table-th">Countries</th>
                  <th className="table-th">Quota</th>
                  <th className="table-th">Accrual</th>
                  <th className="table-th">Carry forward</th>
                  <th className="table-th">Options</th>
                  <th className="table-th">Rules</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data?.filter((t) => !country || !t.country_codes.length || t.country_codes.includes(country)).map((t) => (
                  <tr key={t.id} className={t.is_active ? '' : 'opacity-50'}>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="font-medium text-slate-900">{t.name}</span>
                        <span className="text-xs text-slate-400">{t.code}</span>
                      </div>
                      <div className="mt-0.5 flex gap-1">
                        {!t.is_paid && <Badge>Unpaid</Badge>}
                        {!t.is_active && <Badge>Inactive</Badge>}
                      </div>
                    </td>
                    <td className="table-td">
                      {t.country_codes.length ? (
                        <span className="flex flex-wrap gap-1">{t.country_codes.map((c) => <CountryTag key={c} code={c} title={countryName(c)} />)}</span>
                      ) : (
                        <span className="text-xs text-slate-500">All countries</span>
                      )}
                    </td>
                    <td className="table-td">{t.is_unlimited ? 'Unlimited' : `${t.annual_quota} / yr`}</td>
                    <td className="table-td">{t.is_unlimited ? '—' : titleCase(t.accrual_frequency)}</td>
                    <td className="table-td">{t.carry_forward_enabled ? `Up to ${t.max_carry_forward}` : 'No'}</td>
                    <td className="table-td text-xs">{[t.allow_half_day && 'Half-day', t.allow_backdated && 'Backdated', t.allow_negative_balance && 'Negative'].filter(Boolean).join(', ') || '—'}</td>
                    <td className="table-td text-xs">{[t.min_notice_days ? `${t.min_notice_days}d notice` : null, t.max_consecutive_days ? `max ${t.max_consecutive_days}d` : null].filter(Boolean).join(', ') || '—'}</td>
                    <td className="table-td whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(t)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm(`Remove ${t.name}?`) && remove.mutate(t)} aria-label="Delete"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <LeaveTypeModal value={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function LeaveTypeModal({ value, onClose }: { value: LeaveType | 'new' | null; onClose: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const [f, setF] = useState<Omit<LeaveType, 'id'>>(BLANK);
  useEffect(() => {
    if (value) setF(existing ? { ...existing } : BLANK);
  }, [value, existing]);
  const toast = useToast();
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => (existing ? api.put(`/leave-types/${existing.id}`, f) : api.post('/leave-types', f)),
    onSuccess: () => {
      toast.success('Leave policy saved');
      void qc.invalidateQueries();
      onClose();
    },
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });

  return (
    <Modal
      open={!!value}
      onClose={onClose}
      wide
      title={existing ? `Edit ${existing.name}` : 'New leave type'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="Code"><input className="input" value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
          </div>
          <Field label="Description"><input className="input" value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
          <div>
            <span className="label">Applies to</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => set('country_codes', [])}
                className={clsx('rounded-lg border px-2.5 py-1 text-xs font-medium', !f.country_codes.length ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}
              >
                All countries
              </button>
              {COUNTRIES.map((c) => {
                const on = f.country_codes.includes(c.code);
                return (
                  <button
                    type="button"
                    key={c.code}
                    title={c.name}
                    onClick={() => set('country_codes', on ? f.country_codes.filter((x) => x !== c.code) : [...f.country_codes, c.code].sort())}
                    className={clsx('rounded-lg border px-2.5 py-1 text-xs font-medium', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Use separate leave types when a country needs a different quota or rules (e.g. Annual Leave for India vs Israel).
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour"><input type="color" className="input h-10 p-1" value={f.color} onChange={(e) => set('color', e.target.value)} /></Field>
            <Field label="Sort order"><input type="number" className="input" value={f.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual quota (days)"><input type="number" step={0.5} min={0} className="input" disabled={f.is_unlimited} value={f.annual_quota} onChange={(e) => set('annual_quota', Number(e.target.value))} /></Field>
            <Field label="Accrual">
              <select className="input" disabled={f.is_unlimited} value={f.accrual_frequency} onChange={(e) => set('accrual_frequency', e.target.value as LeaveType['accrual_frequency'])}>
                <option value="YEARLY">Yearly (upfront)</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min notice (days)"><input type="number" min={0} className="input" value={f.min_notice_days} onChange={(e) => set('min_notice_days', Number(e.target.value))} /></Field>
            <Field label="Max consecutive days"><input type="number" min={1} className="input" value={f.max_consecutive_days ?? ''} onChange={(e) => set('max_consecutive_days', e.target.value ? Number(e.target.value) : null)} /></Field>
          </div>
          {f.carry_forward_enabled && (
            <Field label="Max carry forward (days)"><input type="number" step={0.5} min={0} className="input" value={f.max_carry_forward} onChange={(e) => set('max_carry_forward', Number(e.target.value))} /></Field>
          )}
        </div>
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 px-4 py-2">
          <Toggle label="Active" checked={f.is_active} onChange={(v) => set('is_active', v)} />
          <Toggle label="Paid leave" checked={f.is_paid} onChange={(v) => set('is_paid', v)} />
          <Toggle label="Unlimited (no balance)" checked={f.is_unlimited} onChange={(v) => set('is_unlimited', v)} />
          <Toggle label="Pro-rate for new joiners" checked={f.prorate_on_joining} onChange={(v) => set('prorate_on_joining', v)} />
          <Toggle label="Carry forward unused days" checked={f.carry_forward_enabled} onChange={(v) => set('carry_forward_enabled', v)} />
          <Toggle label="Allow half-day" checked={f.allow_half_day} onChange={(v) => set('allow_half_day', v)} />
          <Toggle label="Allow past dates" checked={f.allow_backdated} onChange={(v) => set('allow_backdated', v)} />
          <Toggle label="Allow negative balance" checked={f.allow_negative_balance} onChange={(v) => set('allow_negative_balance', v)} />
        </div>
      </div>
      <div className="mt-4"><ErrorNote error={save.error} /></div>
    </Modal>
  );
}
