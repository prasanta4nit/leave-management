import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorNote, Field, Modal, PageHeader, Spinner, Toggle } from '../components/ui';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { fmtDate, isoDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Holiday } from '../lib/types';

export default function Holidays() {
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null);
  const today = isoDate(new Date());

  const q = useQuery({ queryKey: ['holidays', year], queryFn: () => api.get<Holiday[]>(`/holidays?year=${year}`) });
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
      {h.is_optional && (
        <Button
          size="sm"
          variant={h.opted_in ? 'success' : 'secondary'}
          disabled={h.date < today || optIn.isPending}
          onClick={() => optIn.mutate(h)}
        >
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
    <div className="space-y-6">
      <PageHeader
        title="Holiday calendar"
        subtitle={`${mandatory.length} company holidays · choose up to ${me.settings.max_optional_holidays} optional holidays`}
        actions={
          <>
            <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {me.is_hr && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add holiday</Button>}
          </>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Company holidays" bodyClass="p-0">
            {mandatory.length ? <ul className="divide-y divide-slate-100">{mandatory.map(row)}</ul> : <EmptyState title="No holidays configured" />}
          </Card>
          <Card title="Optional holidays" action={<Badge>{chosen} / {me.settings.max_optional_holidays} chosen</Badge>} bodyClass="p-0">
            {optional.length ? <ul className="divide-y divide-slate-100">{optional.map(row)}</ul> : <EmptyState title="No optional holidays" />}
          </Card>
        </div>
      )}
      <HolidayModal holiday={editing} onClose={() => setEditing(null)} defaultYear={year} />
    </div>
  );
}

function HolidayModal({ holiday, onClose, defaultYear }: { holiday: Holiday | 'new' | null; onClose: () => void; defaultYear: number }) {
  const existing = holiday && holiday !== 'new' ? holiday : null;
  const [form, setForm] = useState({ name: '', date: `${defaultYear}-01-01`, is_optional: false, description: '' });
  const [key, setKey] = useState<unknown>(null);
  if (holiday !== key) {
    setKey(holiday);
    setForm(existing ? { name: existing.name, date: existing.date, is_optional: existing.is_optional, description: existing.description ?? '' } : { name: '', date: `${defaultYear}-01-01`, is_optional: false, description: '' });
  }
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => (existing ? api.put(`/holidays/${existing.id}`, form) : api.post('/holidays', form)),
    onSuccess: () => {
      toast.success('Holiday saved');
      void qc.invalidateQueries({ queryKey: ['holidays'] });
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
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Toggle label="Optional holiday (employees opt in)" checked={form.is_optional} onChange={(v) => setForm({ ...form, is_optional: v })} />
        <ErrorNote error={m.error} />
      </div>
    </Modal>
  );
}
