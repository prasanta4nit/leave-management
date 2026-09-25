import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Button, Card, ErrorNote, Field, Modal, PageHeader, PersonCell, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { Balance, EmployeeBrief } from '../../lib/types';

type Row = { employee: EmployeeBrief; balances: Balance[] };

export default function Balances() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [adjust, setAdjust] = useState<{ employee: EmployeeBrief; balance: Balance } | null>(null);
  const q = useQuery({ queryKey: ['balances-overview', year], queryFn: () => api.get<Row[]>(`/admin/stats/balances-overview?year=${year}`) });
  const types = useMemo(() => (q.data?.[0]?.balances ?? []).filter((b) => !b.is_unlimited), [q.data]);

  return (
    <div>
      <PageHeader
        title="Leave balances"
        subtitle="Available / credited per employee. Click a cell to adjust a balance (recorded in the audit log)."
        actions={
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear + 1, thisYear, thisYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        }
      />
      <Card bodyClass="p-0">
        {q.isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">Employee</th>
                  {types.map((t) => (
                    <th key={t.leave_type_id} className="table-th text-center">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />{t.leave_type_name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data?.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="table-td"><PersonCell person={row.employee} /></td>
                    {types.map((t) => {
                      const b = row.balances.find((x) => x.leave_type_id === t.leave_type_id)!;
                      return (
                        <td key={t.leave_type_id} className="table-td text-center">
                          <button onClick={() => setAdjust({ employee: row.employee, balance: b })} className="rounded-md px-2 py-1 tabular-nums hover:bg-brand-50" title={`Used ${b.used}, pending ${b.pending}`}>
                            <span className="font-semibold text-slate-900">{b.available}</span>
                            <span className="text-slate-400"> / {b.credited}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AdjustModal value={adjust} year={year} onClose={() => setAdjust(null)} />
    </div>
  );
}

function AdjustModal({ value, year, onClose }: { value: { employee: EmployeeBrief; balance: Balance } | null; year: number; onClose: () => void }) {
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () =>
      api.post('/admin/leave-balances/adjust', {
        employee_id: value!.employee.id,
        leave_type_id: value!.balance.leave_type_id,
        year,
        delta,
        reason,
      }),
    onSuccess: () => {
      toast.success('Balance adjusted');
      void qc.invalidateQueries();
      setReason('');
      onClose();
    },
  });
  const b = value?.balance;
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title="Adjust leave balance"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending} disabled={reason.trim().length < 3 || !delta}>Apply adjustment</Button></>}
    >
      {value && b && (
        <div className="space-y-4">
          <PersonCell person={value.employee} />
          <dl className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs">
            {[['Allocated', b.allocated + b.accrued], ['Carried fwd', b.carried_forward], ['Adjusted', b.adjusted], ['Available', b.available ?? 0]].map(([k, v]) => (
              <div key={k as string}><dt className="text-slate-500">{k}</dt><dd className="text-base font-semibold text-slate-900">{v}</dd></div>
            ))}
          </dl>
          <p className="text-sm text-slate-600">{b.leave_type_name} · {year}</p>
          <Field label="Adjustment (days)" hint="Use a negative number to deduct. Half days allowed.">
            <input type="number" step={0.5} className="input" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
          </Field>
          <Field label="Reason (required)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Joining bonus leave, correction" /></Field>
          <ErrorNote error={m.error} />
        </div>
      )}
    </Modal>
  );
}
