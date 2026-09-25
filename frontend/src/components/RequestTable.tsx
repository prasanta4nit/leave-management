import { useState } from 'react';
import { dateRange, durationLabel, fmtDate, fmtDays, kindLabel } from '../lib/format';
import type { AnyRequest, RequestKind } from '../lib/types';
import RequestDetailModal from './RequestDetailModal';
import { Badge, EmptyState, PersonCell, StatusBadge } from './ui';

/** Clickable list of leave / WFH requests that opens the detail modal. */
export default function RequestTable({ rows, showEmployee, showKind, empty = 'No requests yet' }: {
  rows: AnyRequest[];
  showEmployee?: boolean;
  showKind?: boolean;
  empty?: string;
}) {
  const [open, setOpen] = useState<{ kind: RequestKind; id: number } | null>(null);
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/60">
            <tr>
              {showEmployee && <th className="table-th">Employee</th>}
              <th className="table-th">Type</th>
              <th className="table-th">Dates</th>
              <th className="table-th">Duration</th>
              <th className="table-th hidden md:table-cell">Applied</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={`${r.kind}-${r.id}`} onClick={() => setOpen({ kind: r.kind, id: r.id })} className="cursor-pointer hover:bg-slate-50">
                {showEmployee && (
                  <td className="table-td">
                    <PersonCell person={r.employee} />
                  </td>
                )}
                <td className="table-td">
                  {r.kind === 'LEAVE' ? (
                    <Badge color={r.leave_type.color}>{r.leave_type.name}</Badge>
                  ) : (
                    <Badge color="#0ea5e9">{kindLabel[r.kind]}</Badge>
                  )}
                  {showKind && r.kind === 'LEAVE' && <span className="sr-only">Leave</span>}
                </td>
                <td className="table-td whitespace-nowrap">{dateRange(r)}</td>
                <td className="table-td whitespace-nowrap">{r.kind === 'LEAVE' ? durationLabel(r) : fmtDays(r.total_days)}</td>
                <td className="table-td hidden whitespace-nowrap text-slate-500 md:table-cell">{fmtDate(r.applied_at)}</td>
                <td className="table-td">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={r.status} />
                    {r.status === 'PENDING' && r.approval_stage === 'HR' && <span className="text-[11px] text-slate-500">HR</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RequestDetailModal kind={open?.kind ?? 'LEAVE'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
