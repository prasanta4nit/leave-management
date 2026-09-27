import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List, Mail, Phone, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Card, CountryTag, EmptyState, PageHeader, PersonCell, Spinner } from '../components/ui';
import { api, qs } from '../lib/api';
import { COUNTRIES, countryName } from '../lib/countries';
import { fmtDate } from '../lib/format';
import type { Department, Designation, Employee } from '../lib/types';

export default function Directory() {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<number | ''>('');
  const [desig, setDesig] = useState<number | ''>('');
  const [country, setCountry] = useState('');
  const [view, setView] = useState<'grid' | 'list' | 'departments'>('grid');

  const employees = useQuery({
    queryKey: ['employees', q, dept, desig, country],
    queryFn: () => api.get<Employee[]>(`/employees${qs({ q, department_id: dept, designation_id: desig, country_code: country })}`),
  });
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments') });
  const desigs = useQuery({ queryKey: ['designations'], queryFn: () => api.get<Designation[]>('/designations') });

  const grouped = useMemo(() => {
    const map = new Map<string, Employee[]>();
    for (const e of employees.data ?? []) {
      const k = e.department ?? 'Unassigned';
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [employees.data]);

  return (
    <div>
      <PageHeader title="Employee directory" subtitle={`${employees.data?.length ?? '…'} people`} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search by name, email or employee code" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={dept} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All departments</option>
          {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input w-auto" value={desig} onChange={(e) => setDesig(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All designations</option>
          {desigs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input w-auto" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
          {([['grid', <LayoutGrid key="g" className="h-4 w-4" />], ['list', <List key="l" className="h-4 w-4" />], ['departments', <span key="d" className="px-1 text-xs font-medium">Teams</span>]] as const).map(([v, icon]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-2 py-1.5 ${view === v ? 'bg-brand-50 text-brand-700' : 'text-slate-500'}`} aria-label={v}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {employees.isLoading ? (
        <Spinner />
      ) : !employees.data?.length ? (
        <Card><EmptyState icon={<Search className="h-8 w-8" />} title="No matching employees" /></Card>
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {employees.data.map((e) => <EmployeeCard key={e.id} e={e} />)}
        </div>
      ) : view === 'list' ? (
        <Card bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Reports to</th>
                  <th className="table-th">Country</th>
                  <th className="table-th hidden md:table-cell">Contact</th>
                  <th className="table-th hidden lg:table-cell">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.data.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="table-td"><Link to={`/employees/${e.id}`}><PersonCell person={e} /></Link></td>
                    <td className="table-td">{e.department}</td>
                    <td className="table-td">{e.manager?.full_name ?? '—'}</td>
                    <td className="table-td"><span className="flex items-center gap-1.5"><CountryTag code={e.country_code} />{e.location}</span></td>
                    <td className="table-td hidden md:table-cell"><div>{e.email}</div><div className="text-xs text-slate-500">{e.phone}</div></td>
                    <td className="table-td hidden whitespace-nowrap lg:table-cell">{fmtDate(e.joining_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([name, list]) => (
            <Card key={name} title={`${name} · ${list.length}`}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((e) => <Link key={e.id} to={`/employees/${e.id}`} className="rounded-lg p-2 hover:bg-slate-50"><PersonCell person={e} /></Link>)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeCard({ e }: { e: Employee }) {
  return (
    <Link to={`/employees/${e.id}`} className="card flex flex-col items-center p-5 text-center transition hover:border-brand-200 hover:shadow-md">
      <Avatar person={e} size="lg" />
      <div className="mt-3 font-medium text-slate-900">{e.full_name}</div>
      <div className="text-sm text-slate-500">{e.designation}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
        <CountryTag code={e.country_code} title={countryName(e.country_code)} />
        {e.location ?? e.department} · {e.employee_code}
      </div>
      <div className="mt-3 flex w-full flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span className="flex items-center justify-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5" />{e.email}</span>
        {e.phone && <span className="flex items-center justify-center gap-1.5"><Phone className="h-3.5 w-3.5" />{e.phone}</span>}
      </div>
    </Link>
  );
}
