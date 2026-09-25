import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Button, ErrorNote, Field, Modal } from '../components/ui';
import { api } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import { useToast } from '../lib/toast';
import EmployeeProfile from './EmployeeProfile';

/** Self-service: view own profile and edit personal details. */
export default function MyProfile() {
  const me = useMe();
  const [editing, setEditing] = useState(false);
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit my details</Button>
      </div>
      <EmployeeProfile employeeId={me.id} />
      <EditSelf open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function EditSelf({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const { refresh } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    phone: me.phone ?? '',
    location: me.location ?? '',
    address: me.address ?? '',
    date_of_birth: me.date_of_birth ?? '',
    emergency_contact_name: me.emergency_contact_name ?? '',
    emergency_contact_phone: me.emergency_contact_phone ?? '',
    avatar_url: me.avatar_url ?? '',
    bio: me.bio ?? '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const m = useMutation({
    mutationFn: () =>
      api.put('/employees/me/profile', Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]))),
    onSuccess: async () => {
      toast.success('Profile updated');
      await refresh();
      void qc.invalidateQueries({ queryKey: ['employee', me.id] });
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit my details"
      wide
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Save</Button></>}
    >
      <p className="mb-4 text-sm text-slate-500">Name, designation, department and manager are managed by HR.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone"><input className="input" value={form.phone} onChange={set('phone')} /></Field>
        <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        <Field label="Date of birth"><input type="date" className="input" value={form.date_of_birth} onChange={set('date_of_birth')} /></Field>
        <Field label="Photo URL"><input className="input" value={form.avatar_url} onChange={set('avatar_url')} placeholder="https://…" /></Field>
        <Field label="Address" className="sm:col-span-2"><input className="input" value={form.address} onChange={set('address')} /></Field>
        <Field label="Emergency contact name"><input className="input" value={form.emergency_contact_name} onChange={set('emergency_contact_name')} /></Field>
        <Field label="Emergency contact phone"><input className="input" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} /></Field>
        <Field label="About me" className="sm:col-span-2"><textarea className="input min-h-[80px]" value={form.bio} onChange={set('bio')} /></Field>
      </div>
      <div className="mt-4"><ErrorNote error={m.error} /></div>
    </Modal>
  );
}
