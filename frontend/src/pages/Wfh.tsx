import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Plus } from 'lucide-react';
import { useState } from 'react';
import RequestTable from '../components/RequestTable';
import { Button, Card, ErrorNote, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { isoDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { WfhRequest } from '../lib/types';

export default function Wfh() {
  const [open, setOpen] = useState(false);
  const wfh = useQuery({ queryKey: ['wfh', 'my'], queryFn: () => api.get<WfhRequest[]>('/wfh/my') });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<Laptop className="h-5 w-5" />}
        title="Work from home"
        subtitle="Request and track work-from-home days"
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Request WFH</Button>}
      />
      <Card title="My WFH requests" bodyClass="p-0">
        {wfh.isLoading ? <Spinner /> : <RequestTable rows={wfh.data ?? []} empty="No WFH requests yet" />}
      </Card>
      <WfhModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function WfhModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = isoDate(new Date());
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState('');
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post('/wfh', { start_date: start, end_date: end, reason: reason || null }),
    onSuccess: () => {
      toast.success('WFH request submitted');
      void qc.invalidateQueries();
      setReason('');
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request work from home"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} loading={m.isPending}>Submit</Button></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><input type="date" className="input" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></Field>
          <Field label="To"><input type="date" className="input" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Reason"><textarea className="input min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <ErrorNote error={m.error} />
      </div>
    </Modal>
  );
}
