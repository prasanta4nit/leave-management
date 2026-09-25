import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorNote, Field, Modal, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { Department, Designation, Employee } from '../../lib/types';

export default function Organization() {
  const toast = useToast();
  const qc = useQueryClient();
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments') });
  const desigs = useQuery({ queryKey: ['designations'], queryFn: () => api.get<Designation[]>('/designations') });
  const [dept, setDept] = useState<Department | 'new' | null>(null);
  const [desig, setDesig] = useState<Designation | 'new' | null>(null);

  const remove = useMutation({
    mutationFn: (path: string) => api.del(path),
    onSuccess: () => {
      toast.success('Deleted');
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  return (
    <div>
      <PageHeader title="Departments & designations" subtitle={<>Reporting hierarchy is managed per employee — see the <Link to="/org-chart" className="text-brand-600 hover:underline">org chart</Link>.</>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Departments" action={<Button size="sm" onClick={() => setDept('new')}><Plus className="h-3.5 w-3.5" /> Add</Button>} bodyClass="p-0">
          {depts.isLoading ? <Spinner /> : (
            <ul className="divide-y divide-slate-100">
              {depts.data?.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{d.name} <span className="text-xs font-normal text-slate-400">{d.code}</span></div>
                    <div className="text-xs text-slate-500">{d.headcount} people · Head: {d.head?.full_name ?? '—'}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDept(d)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${d.name}?`) && remove.mutate(`/departments/${d.id}`)} aria-label="Delete"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Designations" action={<Button size="sm" onClick={() => setDesig('new')}><Plus className="h-3.5 w-3.5" /> Add</Button>} bodyClass="p-0">
          {desigs.isLoading ? <Spinner /> : (
            <ul className="divide-y divide-slate-100">
              {desigs.data?.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{d.name}</div>
                    <div className="text-xs text-slate-500">Level {d.level} · {d.headcount} people</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setDesig(d)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => confirm(`Delete ${d.name}?`) && remove.mutate(`/designations/${d.id}`)} aria-label="Delete"><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <DeptModal value={dept} onClose={() => setDept(null)} />
      <DesigModal value={desig} onClose={() => setDesig(null)} />
    </div>
  );
}

function useSave(onClose: () => void) {
  const toast = useToast();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body, isNew }: { path: string; body: unknown; isNew: boolean }) => (isNew ? api.post(path, body) : api.put(path, body)),
    onSuccess: () => {
      toast.success('Saved');
      void qc.invalidateQueries();
      onClose();
    },
  });
}

function DeptModal({ value, onClose }: { value: Department | 'new' | null; onClose: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({ name: '', code: '', description: '', head_id: '' });
  useEffect(() => {
    setForm(existing ? { name: existing.name, code: existing.code, description: existing.description ?? '', head_id: existing.head_id ? String(existing.head_id) : '' } : { name: '', code: '', description: '', head_id: '' });
  }, [value, existing]);
  const people = useQuery({ queryKey: ['employees', 'all'], queryFn: () => api.get<Employee[]>('/employees'), enabled: !!value });
  const save = useSave(onClose);
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={existing ? 'Edit department' : 'Add department'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate({ path: existing ? `/departments/${existing.id}` : '/departments', isNew: !existing, body: { ...form, head_id: form.head_id ? Number(form.head_id) : null, description: form.description || null } })}>Save</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Name" className="col-span-2"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Code"><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
        </div>
        <Field label="Department head">
          <select className="input" value={form.head_id} onChange={(e) => setForm({ ...form, head_id: e.target.value })}>
            <option value="">—</option>
            {people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label="Description"><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}

function DesigModal({ value, onClose }: { value: Designation | 'new' | null; onClose: () => void }) {
  const existing = value && value !== 'new' ? value : null;
  const [form, setForm] = useState({ name: '', level: 1 });
  useEffect(() => {
    setForm(existing ? { name: existing.name, level: existing.level } : { name: '', level: 1 });
  }, [value, existing]);
  const save = useSave(onClose);
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      title={existing ? 'Edit designation' : 'Add designation'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate({ path: existing ? `/designations/${existing.id}` : '/designations', isNew: !existing, body: form })}>Save</Button></>}
    >
      <div className="space-y-4">
        <Field label="Title"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Level" hint="Higher = more senior; used to order the org chart."><input type="number" min={1} max={20} className="input" value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} /></Field>
        <ErrorNote error={save.error} />
      </div>
    </Modal>
  );
}
