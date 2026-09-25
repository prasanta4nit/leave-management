import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { fmtDateTime, titleCase } from '../../lib/format';
import type { EmployeeBrief } from '../../lib/types';

type Entry = { id: number; actor: EmployeeBrief | null; entity: string; entity_id: string | null; action: string; details: unknown; created_at: string };

const ENTITIES = ['employee', 'department', 'designation', 'leave_type', 'leave_balance', 'holiday', 'settings', 'job'];

export default function AuditLog() {
  const [entity, setEntity] = useState('');
  const q = useQuery({ queryKey: ['audit', entity], queryFn: () => api.get<Entry[]>(`/admin/audit-logs${qs({ entity, limit: 300 })}`) });
  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle="Administrative changes. Approval decisions are in Approvals → History."
        actions={
          <select className="input w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All entities</option>
            {ENTITIES.map((e) => <option key={e} value={e}>{titleCase(e)}</option>)}
          </select>
        }
      />
      <Card bodyClass="p-0">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState title="No audit entries" /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">When</th>
                  <th className="table-th">Who</th>
                  <th className="table-th">Action</th>
                  <th className="table-th">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="table-td whitespace-nowrap text-slate-500">{fmtDateTime(a.created_at)}</td>
                    <td className="table-td whitespace-nowrap">{a.actor?.full_name ?? 'System'}</td>
                    <td className="table-td whitespace-nowrap">
                      <span className="font-medium">{titleCase(a.action)}</span> <span className="text-slate-500">{titleCase(a.entity)}{a.entity_id ? ` #${a.entity_id}` : ''}</span>
                    </td>
                    <td className="table-td">
                      {a.details ? <pre className="max-w-xl overflow-x-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-[11px] text-slate-600">{JSON.stringify(a.details, null, 1)}</pre> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
