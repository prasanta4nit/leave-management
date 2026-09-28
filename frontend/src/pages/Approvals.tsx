import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CheckCheck, CheckSquare, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import RequestDetailModal from '../components/RequestDetailModal';
import { Badge, Button, Card, EmptyState, PageHeader, PersonCell, Spinner, StatusBadge, Tabs } from '../components/ui';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { dateRange, durationLabel, fmtDateTime, fmtDays, fromNow, kindLabel, titleCase } from '../lib/format';
import { useToast } from '../lib/toast';
import type { AnyRequest, HistoryEntry, RequestKind } from '../lib/types';

type Tab = 'mine' | 'all' | 'history';
const DECIDE: Record<RequestKind, string> = { LEAVE: 'leave', WFH: 'wfh' };

export default function Approvals() {
  const me = useMe();
  const [tab, setTab] = useState<Tab>('mine');
  const [kind, setKind] = useState<RequestKind | ''>('');
  const pending = useQuery({ queryKey: ['approvals', 'pending'], queryFn: () => api.get<AnyRequest[]>('/approvals/pending') });
  const history = useQuery({
    queryKey: ['approvals', 'history'],
    queryFn: () => api.get<HistoryEntry[]>('/approvals/history?limit=200'),
    enabled: tab === 'history',
  });

  const rows = (pending.data ?? []).filter((r) => (tab === 'mine' ? r.awaiting_me : true)).filter((r) => !kind || r.kind === kind);
  const mineCount = pending.data?.filter((r) => r.awaiting_me).length ?? 0;
  const tabs: { value: Tab; label: string }[] = [{ value: 'mine', label: `Awaiting me (${mineCount})` }];
  if (me.is_hr) tabs.push({ value: 'all', label: `All pending (${pending.data?.length ?? 0})` });
  tabs.push({ value: 'history', label: 'History & audit trail' });

  return (
    <div>
      <PageHeader icon={<CheckSquare className="h-5 w-5" />} title="Approvals" subtitle="Review leave and work-from-home requests" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab !== 'history' ? (
        <>
          <div className="mb-4 flex gap-2">
            {(['', 'LEAVE', 'WFH'] as const).map((k) => (
              <button
                key={k || 'all'}
                onClick={() => setKind(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${kind === k ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
              >
                {k ? kindLabel[k] : 'All types'}
              </button>
            ))}
          </div>
          {pending.isLoading ? (
            <Spinner />
          ) : rows.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {rows.map((r) => <ApprovalCard key={`${r.kind}-${r.id}`} r={r} />)}
            </div>
          ) : (
            <Card><EmptyState icon={<CheckCheck className="h-10 w-10" />} title="All caught up!">No requests are waiting for your approval.</EmptyState></Card>
          )}
        </>
      ) : (
        <HistoryTable entries={history.data} loading={history.isLoading} />
      )}
    </div>
  );
}

function ApprovalCard({ r }: { r: AnyRequest }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [detail, setDetail] = useState(false);
  const m = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      api.post<{ outcome: string }>(`/approvals/${DECIDE[r.kind]}/${r.id}/${action}`, { comment: comment || null }),
    onSuccess: (res) => {
      toast.success(res.outcome === 'ESCALATED' ? 'Approved — sent to HR for final approval' : `Request ${res.outcome.toLowerCase()}`);
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  return (
    <div className="card flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setDetail(true)} className="text-left"><PersonCell person={r.employee} /></button>
        <div className="flex flex-col items-end gap-1">
          {r.kind === 'LEAVE' ? <Badge color={r.leave_type.color}>{r.leave_type.name}</Badge> : <Badge color="#0ea5e9">{kindLabel[r.kind]}</Badge>}
          <span className="text-[11px] text-slate-400">{fromNow(r.applied_at)}</span>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <div className="font-medium text-slate-900">{dateRange(r)}</div>
        <div className="text-slate-600">{r.kind === 'LEAVE' ? durationLabel(r) : fmtDays(r.total_days)}</div>
        {r.reason && <p className="mt-1 text-slate-600">“{r.reason}”</p>}
      </div>
      {r.can_override && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5" />
          {r.approval_stage === 'MANAGER' ? `Awaiting ${r.current_approver?.full_name ?? 'manager'} — acting now is an HR override` : 'HR override'}
        </p>
      )}
      {r.approval_stage === 'HR' && !r.can_override && <p className="mt-2 text-xs text-slate-500">Manager approved · awaiting HR</p>}
      {rejecting && (
        <textarea autoFocus className="input mt-3 min-h-[60px]" placeholder="Reason for rejection (required)" value={comment} onChange={(e) => setComment(e.target.value)} />
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setDetail(true)}>Details</Button>
        {rejecting ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => setRejecting(false)}>Back</Button>
            <Button variant="danger" size="sm" disabled={!comment.trim()} loading={m.isPending} onClick={() => m.mutate('reject')}>Confirm reject</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}><X className="h-3.5 w-3.5" /> Reject</Button>
            <Button variant="success" size="sm" loading={m.isPending} onClick={() => m.mutate('approve')}><Check className="h-3.5 w-3.5" /> Approve</Button>
          </>
        )}
      </div>
      <RequestDetailModal kind={r.kind} id={detail ? r.id : null} onClose={() => setDetail(false)} />
    </div>
  );
}

function HistoryTable({ entries, loading }: { entries?: HistoryEntry[]; loading: boolean }) {
  const [open, setOpen] = useState<{ kind: RequestKind; id: number } | null>(null);
  if (loading) return <Spinner />;
  if (!entries?.length) return <Card><EmptyState title="No approval activity yet" /></Card>;
  return (
    <Card bodyClass="p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/60">
            <tr>
              <th className="table-th">When</th>
              <th className="table-th">Action</th>
              <th className="table-th">By</th>
              <th className="table-th">Request</th>
              <th className="table-th">Comment</th>
              <th className="table-th">Current</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map((h) => (
              <tr key={h.id} className="cursor-pointer hover:bg-slate-50" onClick={() => h.request && setOpen({ kind: h.request.kind, id: h.request.id })}>
                <td className="table-td whitespace-nowrap text-slate-500">{fmtDateTime(h.created_at)}</td>
                <td className="table-td whitespace-nowrap">
                  <span className="font-medium">{titleCase(h.action)}</span>
                  {h.is_override && <Badge className="ml-1.5 bg-amber-50 text-amber-700 ring-amber-600/20">override</Badge>}
                </td>
                <td className="table-td whitespace-nowrap">{h.actor?.full_name ?? 'System'}</td>
                <td className="table-td">
                  {h.request && (
                    <div>
                      <div className="font-medium text-slate-900">{h.request.employee.full_name}</div>
                      <div className="text-xs text-slate-500">{kindLabel[h.request.kind]} · {dateRange(h.request)}</div>
                    </div>
                  )}
                </td>
                <td className="table-td max-w-xs truncate text-slate-600">{h.comment}</td>
                <td className="table-td">{h.request && <StatusBadge status={h.request.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RequestDetailModal kind={open?.kind ?? 'LEAVE'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </Card>
  );
}
