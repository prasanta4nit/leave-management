import { useQuery } from '@tanstack/react-query';
import { Briefcase, Calendar, Mail, MapPin, Phone, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import BalanceCards from '../components/BalanceCards';
import RequestTable from '../components/RequestTable';
import { Avatar, Badge, Card, EmptyState, ErrorNote, PersonCell, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { fmtDate, titleCase } from '../lib/format';
import type { Balance, Employee, EmployeeBrief, LeaveRequest } from '../lib/types';

export default function EmployeeProfile({ employeeId }: { employeeId?: number }) {
  const params = useParams();
  const id = employeeId ?? Number(params.id);
  const me = useMe();

  const emp = useQuery({ queryKey: ['employee', id], queryFn: () => api.get<Employee>(`/employees/${id}`) });
  const team = useQuery({
    queryKey: ['employee', id, 'team'],
    queryFn: () => api.get<{ manager: EmployeeBrief | null; peers: EmployeeBrief[]; direct_reports: EmployeeBrief[] }>(`/employees/${id}/team`),
  });
  // Private data: the API returns 403 unless viewer is self, in the management chain, or HR.
  const canSeePrivate = emp.data?.address !== undefined;
  const balances = useQuery({
    queryKey: ['employee', id, 'balances'],
    queryFn: () => api.get<Balance[]>(`/employees/${id}/balances`),
    enabled: canSeePrivate,
  });
  const leaves = useQuery({
    queryKey: ['employee', id, 'leaves'],
    queryFn: () => api.get<LeaveRequest[]>(`/employees/${id}/leaves`),
    enabled: canSeePrivate,
  });

  if (emp.isLoading) return <Spinner />;
  if (emp.isError || !emp.data) return <ErrorNote error={emp.error} />;
  const e = emp.data;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-brand-600 to-violet-500" />
        <div className="flex flex-wrap items-end gap-4 px-6 pb-5">
          <div className="-mt-10 rounded-full ring-4 ring-white"><Avatar person={e} size="xl" /></div>
          <div className="min-w-0 flex-1 pt-3">
            <h1 className="text-xl font-semibold text-slate-900">{e.full_name}</h1>
            <p className="text-sm text-slate-500">{e.designation} · {e.department}</p>
          </div>
          <div className="flex flex-wrap gap-2 pt-3">
            <Badge>{e.employee_code}</Badge>
            <Badge>{titleCase(e.employment_type)}</Badge>
            {e.role !== 'EMPLOYEE' && <Badge className="bg-brand-50 text-brand-700 ring-brand-600/20">{e.role}</Badge>}
            {e.status !== 'ACTIVE' && <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">Inactive</Badge>}
            {me.is_hr && <Link to={`/admin/employees?edit=${e.id}`} className="text-sm font-medium text-brand-600 hover:underline">Edit</Link>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Profile">
          <dl className="space-y-3 text-sm">
            <Row icon={<Mail className="h-4 w-4" />} label="Email"><a href={`mailto:${e.email}`} className="text-brand-600 hover:underline">{e.email}</a></Row>
            <Row icon={<Phone className="h-4 w-4" />} label="Phone">{e.phone ?? '—'}</Row>
            <Row icon={<Briefcase className="h-4 w-4" />} label="Reporting manager">
              {e.manager ? <Link to={`/employees/${e.manager.id}`} className="text-brand-600 hover:underline">{e.manager.full_name}</Link> : '—'}
            </Row>
            <Row icon={<Calendar className="h-4 w-4" />} label="Joined">{fmtDate(e.joining_date)}</Row>
            <Row icon={<MapPin className="h-4 w-4" />} label="Location">{e.location ?? '—'}</Row>
            {canSeePrivate && (
              <>
                <Row icon={<User className="h-4 w-4" />} label="Date of birth">{fmtDate(e.date_of_birth)}</Row>
                <Row icon={<MapPin className="h-4 w-4" />} label="Address">{e.address ?? '—'}</Row>
                <Row icon={<Phone className="h-4 w-4" />} label="Emergency contact">
                  {e.emergency_contact_name ? `${e.emergency_contact_name} (${e.emergency_contact_phone ?? '—'})` : '—'}
                </Row>
              </>
            )}
          </dl>
          {e.bio && <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">{e.bio}</p>}
        </Card>

        <Card title="Team" className="lg:col-span-2">
          {team.data ? (
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Reports to</h3>
                {team.data.manager ? <Link to={`/employees/${team.data.manager.id}`}><PersonCell person={team.data.manager} /></Link> : <p className="text-sm text-slate-400">—</p>}
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Direct reports ({team.data.direct_reports.length})</h3>
                <div className="space-y-2">
                  {team.data.direct_reports.map((p) => <Link key={p.id} to={`/employees/${p.id}`} className="block"><PersonCell person={p} /></Link>)}
                  {!team.data.direct_reports.length && <p className="text-sm text-slate-400">None</p>}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-slate-500">Peers ({team.data.peers.length})</h3>
                <div className="space-y-2">
                  {team.data.peers.slice(0, 8).map((p) => <Link key={p.id} to={`/employees/${p.id}`} className="block"><PersonCell person={p} /></Link>)}
                  {!team.data.peers.length && <p className="text-sm text-slate-400">None</p>}
                </div>
              </div>
            </div>
          ) : (
            <Spinner />
          )}
        </Card>
      </div>

      {canSeePrivate ? (
        <>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Leave balance ({new Date().getFullYear()})</h2>
            {balances.data ? <BalanceCards balances={balances.data} /> : <Spinner />}
          </div>
          <Card title="Leave history" bodyClass="p-0">
            {leaves.data ? <RequestTable rows={leaves.data} empty="No leave taken yet" /> : <Spinner />}
          </Card>
        </>
      ) : (
        <Card><EmptyState title="Leave details are private">Only the employee, their managers and HR can see leave balances and history.</EmptyState></Card>
      )}
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="break-words text-slate-800">{children}</dd>
      </div>
    </div>
  );
}
