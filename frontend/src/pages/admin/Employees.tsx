import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Pencil, Plus, Search, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, CountryTag, ErrorNote, Field, Modal, PageHeader, PersonCell, Spinner, StatusBadge, Toggle } from '../../components/ui';
import { api, qs } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { COUNTRIES, countryName } from '../../lib/countries';
import { fmtDate, titleCase } from '../../lib/format';
import { useToast } from '../../lib/toast';
import type { Department, Designation, Employee, HolidayCalendar } from '../../lib/types';

export default function AdminEmployees() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['employees', 'admin', q, status],
    queryFn: () => api.get<Employee[]>(`/employees${qs({ q, status })}`),
  });

  useEffect(() => {
    const id = Number(params.get('edit'));
    if (id && list.data) {
      const e = list.data.find((x) => x.id === id);
      if (e) setEditing(e);
      setParams({}, { replace: true });
    }
  }, [params, list.data, setParams]);

  const deactivate = useMutation({
    mutationFn: (e: Employee) => api.del(`/employees/${e.id}`),
    onSuccess: () => {
      toast.success('Employee deactivated; their direct reports moved to their manager');
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  return (
    <div>
      <PageHeader icon={<Briefcase className="h-5 w-5" />} title="Employee management" subtitle="Add employees, update roles and reporting lines" actions={<Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add employee</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Search employees" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ALL">All</option>
        </select>
      </div>
      <Card bodyClass="p-0">
        {list.isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/60">
                <tr>
                  <th className="table-th">Employee</th>
                  <th className="table-th">Code</th>
                  <th className="table-th">Department</th>
                  <th className="table-th">Manager</th>
                  <th className="table-th">Country</th>
                  <th className="table-th">Role</th>
                  <th className="table-th">Joined</th>
                  <th className="table-th">Status</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data?.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="table-td"><PersonCell person={e} /></td>
                    <td className="table-td">{e.employee_code}</td>
                    <td className="table-td">{e.department ?? '—'}</td>
                    <td className="table-td">{e.manager?.full_name ?? '—'}</td>
                    <td className="table-td"><CountryTag code={e.country_code} title={countryName(e.country_code)} /></td>
                    <td className="table-td">{titleCase(e.role)}</td>
                    <td className="table-td whitespace-nowrap">{fmtDate(e.joining_date)}</td>
                    <td className="table-td"><StatusBadge status={e.status} /></td>
                    <td className="table-td whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(e)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                      {e.status === 'ACTIVE' && (
                        <Button size="sm" variant="ghost" aria-label="Deactivate" onClick={() => confirm(`Deactivate ${e.full_name}? They will no longer be able to sign in.`) && deactivate.mutate(e)}>
                          <UserX className="h-4 w-4 text-rose-500" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <EmployeeForm employee={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

const EMPTY = {
  first_name: '', last_name: '', email: '', employee_code: '', phone: '', gender: '', date_of_birth: '',
  designation_id: '', department_id: '', manager_id: '', role: 'EMPLOYEE', employment_type: 'FULL_TIME',
  joining_date: new Date().toISOString().slice(0, 10), exit_date: '', status: 'ACTIVE', location: '', address: '',
  country_code: 'IN', holiday_calendar_id: '',
  emergency_contact_name: '', emergency_contact_phone: '',
};
type Form = typeof EMPTY;

function EmployeeForm({ employee, onClose }: { employee: Employee | 'new' | null; onClose: () => void }) {
  const me = useMe();
  const toast = useToast();
  const qc = useQueryClient();
  const existing = employee && employee !== 'new' ? employee : null;
  const [form, setForm] = useState<Form>(EMPTY);
  const [invite, setInvite] = useState(true);

  useEffect(() => {
    if (!employee) return;
    if (existing) {
      const f = { ...EMPTY };
      for (const k of Object.keys(EMPTY) as (keyof Form)[]) {
        const v = (existing as unknown as Record<string, unknown>)[k];
        f[k] = v === null || v === undefined ? '' : String(v);
      }
      setForm(f);
    } else {
      setForm(EMPTY);
    }
  }, [employee, existing]);

  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments'), enabled: !!employee });
  const desigs = useQuery({ queryKey: ['designations'], queryFn: () => api.get<Designation[]>('/designations'), enabled: !!employee });
  const people = useQuery({ queryKey: ['employees', 'all'], queryFn: () => api.get<Employee[]>('/employees'), enabled: !!employee });
  const calendars = useQuery({ queryKey: ['holiday-calendars'], queryFn: () => api.get<HolidayCalendar[]>('/holiday-calendars'), enabled: !!employee });
  const autoCalendar =
    calendars.data?.find((c) => c.country_code === form.country_code) ?? calendars.data?.find((c) => c.is_default);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (['designation_id', 'department_id', 'manager_id', 'holiday_calendar_id'].includes(k)) body[k] = v ? Number(v) : null;
        else body[k] = v === '' ? null : v;
      }
      if (!existing) {
        delete body.status;
        delete body.exit_date;
        body.send_invite = invite;
        return api.post('/employees', body);
      }
      return api.put(`/employees/${existing.id}`, body);
    },
    onSuccess: () => {
      toast.success(existing ? 'Employee updated' : 'Employee created');
      void qc.invalidateQueries();
      onClose();
    },
  });

  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Modal
      open={!!employee}
      onClose={onClose}
      title={existing ? `Edit ${existing.full_name}` : 'Add employee'}
      wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save</Button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name *"><input className="input" value={form.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name *"><input className="input" value={form.last_name} onChange={set('last_name')} /></Field>
        <Field label="Work email *"><input type="email" className="input" value={form.email} onChange={set('email')} /></Field>
        <Field label="Employee code" hint={existing ? undefined : 'Leave blank to auto-generate'}><input className="input" value={form.employee_code} onChange={set('employee_code')} /></Field>
        <Field label="Department">
          <select className="input" value={form.department_id} onChange={set('department_id')}>
            <option value="">—</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Designation">
          <select className="input" value={form.designation_id} onChange={set('designation_id')}>
            <option value="">—</option>
            {desigs.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Reporting manager">
          <select className="input" value={form.manager_id} onChange={set('manager_id')}>
            <option value="">— None (top of hierarchy) —</option>
            {people.data?.filter((p) => p.id !== existing?.id).map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.designation}</option>)}
          </select>
        </Field>
        <Field label="Role" hint="Managers are detected automatically from reporting lines.">
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="EMPLOYEE">Employee</option>
            <option value="HR">HR</option>
            {me.is_admin && <option value="ADMIN">Admin</option>}
          </select>
        </Field>
        <Field label="Employment type">
          <select className="input" value={form.employment_type} onChange={set('employment_type')}>
            {['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </select>
        </Field>
        <Field label="Joining date *"><input type="date" className="input" value={form.joining_date} onChange={set('joining_date')} /></Field>
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Country">
          <select className="input" value={form.country_code} onChange={set('country_code')}>
            <option value="">—</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Holiday calendar" hint="Decides which holidays and weekend apply to this employee's leave.">
          <select className="input" value={form.holiday_calendar_id} onChange={set('holiday_calendar_id')}>
            <option value="">Automatic — {autoCalendar ? autoCalendar.name : 'default'} (from country)</option>
            {calendars.data?.map((c) => <option key={c.id} value={c.id}>{c.name} (override)</option>)}
          </select>
        </Field>
        <Field label="City / location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        <Field label="Gender">
          <select className="input" value={form.gender} onChange={set('gender')}>
            <option value="">—</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option>
          </select>
        </Field>
        <Field label="Date of birth"><input type="date" className="input" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        {existing && (
          <>
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </Field>
            <Field label="Exit date"><input type="date" className="input" value={form.exit_date} onChange={set('exit_date')} /></Field>
          </>
        )}
        <Field label="Address" className="sm:col-span-2"><input className="input" value={form.address} onChange={set('address')} /></Field>
        {!existing && (
          <div className="sm:col-span-2">
            <Toggle label="Create login and email a temporary password (Cognito)" checked={invite} onChange={setInvite} />
          </div>
        )}
      </div>
      <div className="mt-4"><ErrorNote error={save.error} /></div>
    </Modal>
  );
}
