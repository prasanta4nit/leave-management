import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import { api, qs } from '../lib/api';
import { useMe } from '../lib/auth';
import { fmtDate, fmtDays, isoDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { Balance, DurationType, EmployeeBrief, LeaveRequest, LeaveType } from '../lib/types';
import { Button, ErrorNote, Field, Modal } from './ui';

interface Preview {
  total_days: number;
  working_dates: string[];
  non_working: { date: string; reason: string }[];
  available: number | null;
  balance_after: number | null;
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function LeaveApplyModal({ open, onClose, existing, defaultDate }: {
  open: boolean;
  onClose: () => void;
  existing?: LeaveRequest | null;
  defaultDate?: string;
}) {
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const today = isoDate(new Date());

  const balances = useQuery({ queryKey: ['balances', 'me'], queryFn: () => api.get<Balance[]>('/leaves/my/balances'), enabled: open });
  const employees = useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api.get<EmployeeBrief[]>('/employees'),
    enabled: open && me.is_hr && !existing,
  });

  const [employeeId, setEmployeeId] = useState<number>(me.id);
  // Only the leave types of the (selected) employee's country
  const types = useQuery({
    queryKey: ['leave-types', 'for', employeeId],
    queryFn: () => api.get<LeaveType[]>(`/leave-types?employee_id=${employeeId}`),
    enabled: open,
  });
  const [typeId, setTypeId] = useState<number | ''>('');
  const [duration, setDuration] = useState<DurationType>('FULL_DAY');
  const [start, setStart] = useState(defaultDate ?? today);
  const [end, setEnd] = useState(defaultDate ?? today);
  const [session, setSession] = useState<'FIRST_HALF' | 'SECOND_HALF'>('FIRST_HALF');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setEmployeeId(existing.employee.id);
      setTypeId(existing.leave_type.id);
      setDuration(existing.duration_type);
      setStart(existing.start_date);
      setEnd(existing.end_date);
      setSession(existing.half_day_session ?? 'FIRST_HALF');
      setReason(existing.reason ?? '');
    } else {
      setEmployeeId(me.id);
      setTypeId('');
      setDuration('FULL_DAY');
      setStart(defaultDate ?? today);
      setEnd(defaultDate ?? today);
      setReason('');
    }
  }, [open, existing, defaultDate, me.id, today]);

  const selectedType = types.data?.find((t) => t.id === typeId);
  const balanceFor = (id: number) => balances.data?.find((b) => b.leave_type_id === id);

  useEffect(() => {
    if (selectedType && duration === 'HALF_DAY' && !selectedType.allow_half_day) setDuration('FULL_DAY');
  }, [selectedType, duration]);

  const body = useMemo(
    () =>
      typeId === ''
        ? null
        : {
            leave_type_id: typeId,
            start_date: start,
            end_date: duration === 'FULL_DAY' ? end : start,
            duration_type: duration,
            half_day_session: duration === 'HALF_DAY' ? session : null,
            reason: reason || null,
            employee_id: employeeId !== me.id ? employeeId : null,
          },
    [typeId, start, end, duration, session, reason, employeeId, me.id],
  );
  const previewBody = useDebounced(body ? { ...body, reason: null } : null);
  const preview = useQuery({
    queryKey: ['leave-preview', previewBody, existing?.id],
    queryFn: () => api.post<Preview>(`/leaves/preview${qs({ exclude_id: existing?.id })}`, previewBody),
    enabled: open && !!previewBody && (duration !== 'FULL_DAY' || end >= start),
    retry: false,
  });

  const submit = useMutation({
    mutationFn: () =>
      existing ? api.put<LeaveRequest>(`/leaves/${existing.id}`, body) : api.post<LeaveRequest>('/leaves', body),
    onSuccess: (r) => {
      toast.success(existing ? 'Leave request updated and sent for approval' : r.status === 'APPROVED' ? 'Leave approved' : 'Leave request submitted');
      void qc.invalidateQueries();
      onClose();
    },
  });

  const durationOptions: { value: DurationType; label: string; enabled: boolean }[] = [
    { value: 'FULL_DAY', label: 'Full day(s)', enabled: true },
    { value: 'HALF_DAY', label: 'Half day', enabled: !selectedType || selectedType.allow_half_day },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Modify leave request' : 'Apply for leave'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => submit.mutate()} loading={submit.isPending} disabled={!body || preview.isError}>
            {existing ? 'Save & resubmit' : 'Submit request'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {me.is_hr && !existing && (
          <Field label="Employee" hint="HR can apply leave on behalf of an employee.">
            <select className="input" value={employeeId} onChange={(e) => { setEmployeeId(Number(e.target.value)); setTypeId(''); }}>
              <option value={me.id}>Myself</option>
              {employees.data?.filter((e) => e.id !== me.id).map((e) => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Leave type">
          <select className="input" value={typeId} onChange={(e) => setTypeId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Select leave type…</option>
            {types.data?.map((t) => {
              const b = balanceFor(t.id);
              const avail = t.is_unlimited ? 'unlimited' : b ? `${b.available} available` : '';
              return (
                <option key={t.id} value={t.id}>
                  {t.name} {employeeId === me.id && avail ? `— ${avail}` : ''}
                </option>
              );
            })}
          </select>
          {selectedType?.description && <p className="mt-1 text-xs text-slate-500">{selectedType.description}</p>}
        </Field>

        <div>
          <span className="label">Duration</span>
          <div className="grid grid-cols-2 gap-2">
            {durationOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={!o.enabled}
                onClick={() => setDuration(o.value)}
                className={clsx(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
                  duration === o.value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {duration === 'FULL_DAY' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Session">
              <select className="input" value={session} onChange={(e) => setSession(e.target.value as typeof session)}>
                <option value="FIRST_HALF">First half</option>
                <option value="SECOND_HALF">Second half</option>
              </select>
            </Field>
          </div>
        )}

        <Field label="Reason">
          <textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note for your approver" maxLength={1000} />
        </Field>

        {preview.isError && <ErrorNote error={preview.error} />}
        {preview.data && !preview.isError && (
          <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-brand-800">Counts as {fmtDays(preview.data.total_days)}</span>
              {preview.data.available !== null && (
                <span className="text-brand-700">
                  Balance: {preview.data.available} → <strong>{preview.data.balance_after}</strong>
                </span>
              )}
            </div>
            {preview.data.non_working.length > 0 && duration === 'FULL_DAY' && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {preview.data.non_working.map((n) => (
                  <li key={n.date}>• {fmtDate(n.date, 'EEE dd MMM')} — {n.reason} (not counted)</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {submit.isError && <ErrorNote error={submit.error} />}
      </div>
    </Modal>
  );
}
