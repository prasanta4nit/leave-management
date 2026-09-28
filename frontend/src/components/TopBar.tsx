import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell, CheckCircle2, ChevronDown, CircleUser, ClipboardList, LogOut, Menu, Plus, Search, XCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import { countryName } from '../lib/countries';
import { dateRange, fromNow, requestTitle } from '../lib/format';
import type { AnyRequest, Employee, RequestKind } from '../lib/types';
import RequestDetailModal from './RequestDetailModal';
import { Avatar, Button, CountryTag } from './ui';

export type NavPage = { to: string; label: string; icon: ReactNode; section?: string };

/** Close a popover on outside click / Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export default function TopBar({ pages, onMenu, onApply }: { pages: NavPage[]; onMenu: () => void; onApply: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <GlobalSearch pages={pages} />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button onClick={onApply} className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Apply leave
          </Button>
          <Button onClick={onApply} className="w-10 !px-0 sm:hidden" aria-label="Apply leave">
            <Plus className="h-4 w-4" />
          </Button>
          <NotificationsBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function GlobalSearch({ pages }: { pages: NavPage[] }) {
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  // Ctrl/Cmd + K focuses search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const people = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<Employee[]>(`/employees${qs({ q: debounced })}`),
    enabled: debounced.length >= 2,
    staleTime: 60_000,
  });

  const term = q.trim().toLowerCase();
  const pageHits = useMemo(() => (term ? pages.filter((p) => p.label.toLowerCase().includes(term)) : pages.slice(0, 6)), [pages, term]);
  const personHits = debounced.length >= 2 ? (people.data ?? []).slice(0, 6) : [];
  const results: { key: string; go: () => void; node: ReactNode }[] = [
    ...personHits.map((e) => ({
      key: `e${e.id}`,
      go: () => navigate(`/employees/${e.id}`),
      node: (
        <>
          <Avatar person={e} size="xs" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-slate-900">{e.full_name}</span>
            <span className="text-slate-500"> · {e.designation}</span>
          </span>
          <CountryTag code={e.country_code} />
        </>
      ),
    })),
    ...pageHits.map((p) => ({
      key: `p${p.to}`,
      go: () => navigate(p.to),
      node: (
        <>
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500">{p.icon}</span>
          <span className="flex-1 truncate text-slate-800">{p.label}</span>
          {p.section && <span className="text-[11px] text-slate-400">{p.section}</span>}
        </>
      ),
    })),
  ];

  const choose = (i: number) => {
    const r = results[i];
    if (!r) return;
    r.go();
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={ref} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          if (e.key === 'Enter') { e.preventDefault(); choose(active); }
        }}
        placeholder="Search…"
        className="h-10 w-full rounded-xl border border-transparent bg-slate-100/80 pl-9 pr-14 text-sm placeholder:text-slate-400 transition focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
        aria-label="Search"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 sm:block">
        Ctrl K
      </kbd>
      {open && (
        <div className="absolute left-0 right-0 top-12 z-40 animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop">
          {personHits.length > 0 && <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">People</div>}
          {results.map((r, i) => (
            <div key={r.key}>
              {i === personHits.length && <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pages</div>}
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={clsx('flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm', i === active ? 'bg-slate-100' : '')}
              >
                {r.node}
              </button>
            </div>
          ))}
          {!results.length && <div className="px-3 py-6 text-center text-sm text-slate-500">{people.isFetching ? 'Searching…' : 'No matches'}</div>}
        </div>
      )}
    </div>
  );
}

interface Notifications {
  awaiting_count: number;
  awaiting: AnyRequest[];
  updates: AnyRequest[];
}

const SEEN_KEY = 'leavedesk.notificationsSeen';
const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

function NotificationsBell() {
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<{ kind: RequestKind; id: number } | null>(null);
  const [seen, setSeen] = useState(readSeen);
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notifications>('/dashboard/notifications'),
    refetchInterval: 60_000,
  });
  const n = q.data;
  const unreadUpdates = n?.updates.filter((u) => (u.decided_at ?? '') > seen).length ?? 0;
  const badge = (n?.awaiting_count ?? 0) + unreadUpdates;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && n?.updates[0]?.decided_at) {
      try {
        localStorage.setItem(SEEN_KEY, n.updates[0].decided_at);
      } catch {
        /* storage unavailable */
      }
      // keep dots visible while the menu is open; clear the badge on close
      setTimeout(() => setSeen(n.updates[0].decided_at ?? ''), 1500);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100" aria-label={`Notifications${badge ? ` (${badge})` : ''}`}>
        <Bell className="h-5 w-5" />
        {badge > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-[22rem] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="font-display text-sm font-semibold text-slate-900">Notifications</span>
            {!!n?.awaiting_count && (
              <button className="link text-xs" onClick={() => { setOpen(false); navigate('/approvals'); }}>
                Open approvals
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-1.5">
            {!!n?.awaiting.length && (
              <>
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Awaiting your approval · {n.awaiting_count}
                </div>
                {n.awaiting.map((r) => (
                  <NoteRow key={`a${r.kind}${r.id}`} onClick={() => setDetail({ kind: r.kind, id: r.id })}
                    icon={<Avatar person={r.employee} size="sm" />}
                    title={<><span className="font-medium">{r.employee.full_name}</span> requested {requestTitle(r).toLowerCase()}</>}
                    meta={`${dateRange(r)} · ${fromNow(r.applied_at)}`}
                    unread />
                ))}
              </>
            )}
            {!!n?.updates.length && (
              <>
                <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Your requests</div>
                {n.updates.map((r) => (
                  <NoteRow key={`u${r.kind}${r.id}`} onClick={() => setDetail({ kind: r.kind, id: r.id })}
                    icon={r.status === 'APPROVED'
                      ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-4 w-4" /></span>
                      : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-rose-600"><XCircle className="h-4 w-4" /></span>}
                    title={<>{requestTitle(r)} {r.status === 'APPROVED' ? 'approved' : r.status === 'REJECTED' ? 'rejected' : r.status.toLowerCase()}{r.decided_by ? ` by ${r.decided_by.first_name}` : ''}</>}
                    meta={`${dateRange(r)} · ${r.decided_at ? fromNow(r.decided_at) : ''}`}
                    unread={(r.decided_at ?? '') > seen} />
                ))}
              </>
            )}
            {!n?.awaiting.length && !n?.updates.length && (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <span className="mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Bell className="h-5 w-5" /></span>
                <p className="text-sm font-medium text-slate-700">You're all caught up</p>
                <p className="text-xs text-slate-500">Approvals and updates on your requests show up here.</p>
              </div>
            )}
          </div>
        </div>
      )}
      <RequestDetailModal kind={detail?.kind ?? 'LEAVE'} id={detail?.id ?? null} onClose={() => setDetail(null)} />
    </div>
  );
}

function NoteRow({ icon, title, meta, unread, onClick }: { icon: ReactNode; title: ReactNode; meta: string; unread?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-slate-700">{title}</span>
        <span className="block truncate text-xs text-slate-500">{meta}</span>
      </span>
      {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
    </button>
  );
}

function UserMenu() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100" aria-label="Account menu">
        <Avatar person={me} size="sm" />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-slate-900">{me.first_name}</span>
          <span className="block text-[11px] text-slate-500">{me.is_admin ? 'Admin' : me.is_hr ? 'HR' : me.is_manager ? 'Manager' : 'Employee'}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-400 md:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-40 w-64 animate-fade-up overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-pop">
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar person={me} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{me.full_name}</div>
              <div className="truncate text-xs text-slate-500">{me.designation}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                <CountryTag code={me.country_code} /> {countryName(me.country_code)} · {me.holiday_calendar?.name ?? 'Default'} calendar
              </div>
            </div>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<CircleUser className="h-4 w-4" />} onClick={() => go('/profile')}>My profile</MenuItem>
          <MenuItem icon={<ClipboardList className="h-4 w-4" />} onClick={() => go('/leaves')}>My leave</MenuItem>
          <div className="my-1 border-t border-slate-100" />
          <MenuItem icon={<LogOut className="h-4 w-4" />} onClick={logout}>Sign out</MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-slate-700 hover:bg-slate-50">
      <span className="text-slate-400">{icon}</span>
      {children}
    </button>
  );
}
