import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, PageHeader, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import type { OrgNode } from '../lib/types';

function countAll(n: OrgNode): number {
  return n.children.reduce((s, c) => s + 1 + countAll(c), 0);
}

export default function OrgChart() {
  const me = useMe();
  const q = useQuery({ queryKey: ['org-chart'], queryFn: () => api.get<OrgNode[]>('/employees/org-chart') });
  const [view, setView] = useState<'tree' | 'outline'>('tree');
  const [zoom, setZoom] = useState(1);

  return (
    <div>
      <PageHeader
        title="Organization chart"
        subtitle="Reporting hierarchy — who reports to whom"
        actions={
          <>
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              {(['tree', 'outline'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={clsx('rounded-md px-3 py-1', view === v ? 'bg-brand-50 text-brand-700' : 'text-slate-500')}>
                  {v === 'tree' ? 'Chart' : 'Outline'}
                </button>
              ))}
            </div>
            {view === 'tree' && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} aria-label="Zoom out"><Minus className="h-4 w-4" /></Button>
                <Button variant="secondary" size="sm" onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))} aria-label="Zoom in"><Plus className="h-4 w-4" /></Button>
              </>
            )}
          </>
        }
      />
      {q.isLoading || !q.data ? (
        <Spinner />
      ) : view === 'tree' ? (
        <Card bodyClass="overflow-auto p-6">
          <div className="inline-flex min-w-full justify-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            {q.data.map((root) => <TreeNode key={root.id} node={root} meId={me.id} depth={0} />)}
          </div>
        </Card>
      ) : (
        <Card>
          {q.data.map((root) => <OutlineNode key={root.id} node={root} meId={me.id} depth={0} />)}
        </Card>
      )}
    </div>
  );
}

function PersonBox({ node, meId }: { node: OrgNode; meId: number }) {
  return (
    <Link
      to={`/employees/${node.id}`}
      className={clsx(
        'flex w-48 flex-col items-center rounded-xl border bg-white px-3 py-3 text-center shadow-sm transition hover:shadow-md',
        node.id === meId ? 'border-brand-400 ring-2 ring-brand-100' : 'border-slate-200',
      )}
    >
      <Avatar person={node} size="md" />
      <div className="mt-2 w-full truncate text-sm font-semibold text-slate-900">{node.full_name}</div>
      <div className="w-full truncate text-xs text-slate-500">{node.designation}</div>
      <div className="mt-1 w-full truncate text-[11px] text-slate-400">{node.department}</div>
    </Link>
  );
}

function TreeNode({ node, meId, depth }: { node: OrgNode; meId: number; depth: number }) {
  const [open, setOpen] = useState(depth < 2);
  const has = node.children.length > 0;
  return (
    <div className="flex flex-col items-center">
      <PersonBox node={node} meId={meId} />
      {has && (
        <button
          onClick={() => setOpen(!open)}
          className="z-10 -mt-2.5 rounded-full border border-slate-300 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
          title={open ? 'Collapse' : 'Expand'}
        >
          {open ? '−' : `+${countAll(node)}`}
        </button>
      )}
      {has && open && (
        <>
          <div className="h-4 w-px bg-slate-300" />
          <div className="flex">
            {node.children.map((c, i) => (
              <div key={c.id} className="relative flex flex-col items-center px-2">
                {/* horizontal connector segments */}
                <div className={clsx('absolute top-0 h-px bg-slate-300', i === 0 ? 'left-1/2 right-0' : i === node.children.length - 1 ? 'left-0 right-1/2' : 'left-0 right-0', node.children.length === 1 && 'hidden')} />
                <div className="h-4 w-px bg-slate-300" />
                <TreeNode node={c} meId={meId} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OutlineNode({ node, meId, depth }: { node: OrgNode; meId: number; depth: number }) {
  const [open, setOpen] = useState(depth < 3);
  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg py-1.5 hover:bg-slate-50" style={{ paddingLeft: depth * 24 }}>
        <button onClick={() => setOpen(!open)} className={clsx('text-slate-400', !node.children.length && 'invisible')} aria-label="Toggle">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Avatar person={node} size="sm" />
        <Link to={`/employees/${node.id}`} className={clsx('text-sm font-medium hover:underline', node.id === meId ? 'text-brand-700' : 'text-slate-900')}>
          {node.full_name}
        </Link>
        <span className="text-xs text-slate-500">{node.designation} · {node.department}</span>
        {node.children.length > 0 && <span className="text-xs text-slate-400">({node.children.length} direct)</span>}
      </div>
      {open && node.children.map((c) => <OutlineNode key={c.id} node={c} meId={meId} depth={depth + 1} />)}
    </div>
  );
}
