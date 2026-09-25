import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleDot, Pencil, ShieldAlert, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { dateRange, durationLabel, fmtDate, fmtDateTime, fmtDays, isoDate, requestTitle, titleCase } from '../lib/format';
import { useToast } from '../lib/toast';
import type { AnyRequest, LeaveRequest, RequestKind } from '../lib/types';
import LeaveApplyModal from './LeaveApplyModal';
import { Badge, Button, ErrorNote, Modal, PersonCell, Spinner, StatusBadge } from './ui';

const DETAIL_PATH: Record<RequestKind, string> = { LEAVE: '/leaves', WFH: '/wfh' };
const DECIDE_PATH: Record<RequestKind, string> = { LEAVE: 'leave', WFH: 'wfh' };

export default function RequestDetailModal({ kind, id, onClose }: { kind: RequestKind; id: number | null; onClose: () => void }) {
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false);

  const detail = useQuery({
    queryKey: ['request', kind, id],
    queryFn: () => api.get<AnyRequest & { can_approve: boolean; can_override: boolean }>(`${DETAIL_PATH[kind]}/${id}`),
    enabled: id !== null,
  });

  const done = (msg: string) => {
    toast.success(msg);
    setComment('');
    void qc.invalidateQueries();
  };
  const decide = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      api.post<{ outcome: string }>(`/approvals/${DECIDE_PATH[kind]}/${id}/${action}`, { comment: comment || null }),
    onSuccess: (r) => done(r.outcome === 'ESCALATED' ? 'Approved — forwarded to HR for final approval' : `Request ${r.outcome.toLowerCase()}`),
    onError: toast.error,
  });
  const cancel = useMutation({
    mutationFn: () => api.post(`${DETAIL_PATH[kind]}/${id}/cancel`, { reason: comment || null }),
    onSuccess: () => done('Request cancelled'),
    onError: toast.error,
  });

  const r = detail.data;
  const isOwner = r?.employee.id === me.id;
  const today = isoDate(new Date());
  const canCancel =
    r && (isOwner || me.is_hr) &&
    (r.status === 'PENDING' || (r.status === 'APPROVED' && (me.is_hr || r.start_date > today)));
  const canModify = r && kind === 'LEAVE' && (isOwner || me.is_hr) && (r.status === 'PENDING' || (r.status === 'APPROVED' && r.start_date > today));
  const canDecide = r && (r.can_approve || r.can_override) && r.status !== 'CANCELLED';

  return (
    <>
      <Modal open={id !== null && !editing} onClose={onClose} title={r ? requestTitle(r) : 'Request'} wide>
        {detail.isLoading && <Spinner />}
        {detail.isError && <ErrorNote error={detail.error} />}
        {r && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <PersonCell person={r.employee} sub={`${r.employee.designation ?? ''} · ${r.employee.department ?? ''}`} />
              <div className="flex items-center gap-2">
                {r.kind === 'LEAVE' && <Badge color={r.leave_type.color}>{r.leave_type.name}</Badge>}
                <StatusBadge status={r.status} />
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3">
              <Item label="Dates">{dateRange(r)}</Item>
              <Item label="Duration">{r.kind === 'LEAVE' ? durationLabel(r as LeaveRequest) : fmtDays(r.total_days)}</Item>
              <Item label="Applied">{fmtDateTime(r.applied_at)}</Item>
              {r.status === 'PENDING' && (
                <Item label="Awaiting">
                  {r.approval_stage === 'HR' ? 'HR approval' : r.current_approver?.full_name ?? '—'}
                </Item>
              )}
              {r.decided_by && <Item label="Decided by">{r.decided_by.full_name}</Item>}
              {r.decided_at && <Item label="Decided on">{fmtDate(r.decided_at)}</Item>}
              <Item label="Reason" wide>{r.reason || <span className="text-slate-400">No reason given</span>}</Item>
              {r.decision_comment && <Item label="Approver comment" wide>{r.decision_comment}</Item>}
              {r.cancel_reason && <Item label="Cancellation reason" wide>{r.cancel_reason}</Item>}
            </dl>

            <div>
              <h4 className="mb-3 text-sm font-semibold text-slate-900">Approval history</h4>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {r.history?.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[27px] top-0.5 rounded-full bg-white">
                      {h.to_status === 'APPROVED' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : h.to_status === 'REJECTED' ? (
                        <XCircle className="h-4 w-4 text-rose-500" />
                      ) : h.is_override ? (
                        <ShieldAlert className="h-4 w-4 text-amber-500" />
                      ) : (
                        <CircleDot className="h-4 w-4 text-brand-500" />
                      )}
                    </span>
                    <div className="text-sm">
                      <span className="font-medium text-slate-900">{titleCase(h.action)}</span>
                      {h.actor && <span className="text-slate-600"> by {h.actor.full_name}</span>}
                      {h.is_override && <Badge className="ml-2 bg-amber-50 text-amber-700 ring-amber-600/20">HR override</Badge>}
                    </div>
                    <div className="text-xs text-slate-500">{fmtDateTime(h.created_at)}</div>
                    {h.comment && <p className="mt-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">{h.comment}</p>}
                  </li>
                ))}
              </ol>
            </div>

            {(canDecide || canCancel) && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                {canDecide && r.can_override && (
                  <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <ShieldAlert className="h-4 w-4" /> You are acting as HR/Admin — this will be recorded as an override.
                  </p>
                )}
                <textarea
                  className="input min-h-[64px]"
                  placeholder={canDecide ? 'Comment (required when rejecting)' : 'Reason for cancellation (optional)'}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  {canModify && (
                    <Button variant="secondary" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4" /> Modify
                    </Button>
                  )}
                  {canCancel && (
                    <Button variant="secondary" onClick={() => cancel.mutate()} loading={cancel.isPending}>
                      Cancel request
                    </Button>
                  )}
                  {canDecide && r.status !== 'REJECTED' && (
                    <Button variant="danger" onClick={() => decide.mutate('reject')} loading={decide.isPending && decide.variables === 'reject'}>
                      Reject
                    </Button>
                  )}
                  {canDecide && r.status !== 'APPROVED' && (
                    <Button variant="success" onClick={() => decide.mutate('approve')} loading={decide.isPending && decide.variables === 'approve'}>
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            )}
            {!canDecide && !canCancel && canModify && (
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Modify
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      {r?.kind === 'LEAVE' && (
        <LeaveApplyModal
          open={editing}
          existing={r}
          onClose={() => {
            setEditing(false);
            onClose();
          }}
        />
      )}
    </>
  );
}

function Item({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-3' : undefined}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-slate-800">{children}</dd>
    </div>
  );
}
