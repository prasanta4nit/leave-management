import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import BalanceCards from '../components/BalanceCards';
import LeaveApplyModal from '../components/LeaveApplyModal';
import RequestTable from '../components/RequestTable';
import { Button, Card, PageHeader, Spinner } from '../components/ui';
import { api, qs } from '../lib/api';
import type { Balance, LeaveRequest, LeaveType } from '../lib/types';

export default function Leaves() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [status, setStatus] = useState('');
  const [applying, setApplying] = useState(false);

  const balances = useQuery({ queryKey: ['balances', 'me', year], queryFn: () => api.get<Balance[]>(`/leaves/my/balances?year=${year}`) });
  const leaves = useQuery({
    queryKey: ['leaves', 'my', year, status],
    queryFn: () => api.get<LeaveRequest[]>(`/leaves/my${qs({ year, status })}`),
  });
  const types = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get<LeaveType[]>('/leave-types') });

  return (
    <div className="space-y-6">
      <PageHeader
        title="My leave"
        subtitle="Balances, requests and policies"
        actions={
          <>
            <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <Button onClick={() => setApplying(true)}><Plus className="h-4 w-4" /> Apply leave</Button>
          </>
        }
      />
      {balances.data ? <BalanceCards balances={balances.data} /> : <Spinner />}

      <Card
        title="Leave requests"
        bodyClass="p-0"
        action={
          <select className="input w-auto py-1 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </select>
        }
      >
        {leaves.isLoading ? <Spinner /> : <RequestTable rows={leaves.data ?? []} empty="No leave requests for this period" />}
      </Card>

      <Card title="Leave policies">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {types.data?.map((t) => (
            <div key={t.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="font-medium text-slate-900">{t.name}</span>
              </div>
              {t.description && <p className="mb-2 text-sm text-slate-500">{t.description}</p>}
              <ul className="space-y-0.5 text-xs text-slate-600">
                {t.is_unlimited ? <li>• No fixed quota{!t.is_paid && ' (unpaid)'}</li> : (
                  <li>• {t.annual_quota} days/year, credited {t.accrual_frequency.toLowerCase()}</li>
                )}
                {t.carry_forward_enabled && <li>• Carry forward up to {t.max_carry_forward} days</li>}
                <li>• {[t.allow_half_day && 'Half-day', t.allow_hourly && 'Hourly'].filter(Boolean).join(' & ') || 'Full days only'}</li>
                {t.min_notice_days > 0 && <li>• Apply {t.min_notice_days} day(s) in advance</li>}
                {t.max_consecutive_days && <li>• Max {t.max_consecutive_days} consecutive days</li>}
                {t.allow_backdated && <li>• Can be applied after the fact</li>}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      <LeaveApplyModal open={applying} onClose={() => setApplying(false)} />
    </div>
  );
}
