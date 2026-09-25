import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarHeart,
  CheckSquare,
  ClipboardList,
  Home,
  Laptop,
  LogOut,
  Menu,
  Network,
  ScrollText,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth, useMe } from '../lib/auth';
import type { AnyRequest } from '../lib/types';
import { Avatar } from './ui';

type Item = { to: string; label: string; icon: ReactNode; badge?: number };

export default function Layout() {
  const me = useMe();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const canApprove = me.is_manager || me.is_hr;

  const pending = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<AnyRequest[]>('/approvals/pending'),
    enabled: canApprove,
    refetchInterval: 60_000,
  });
  const awaiting = pending.data?.filter((p) => p.awaiting_me).length ?? 0;

  const main: Item[] = [
    { to: '/', label: 'Dashboard', icon: <Home className="h-4 w-4" /> },
    { to: '/leaves', label: 'My Leave', icon: <ClipboardList className="h-4 w-4" /> },
    { to: '/wfh', label: 'Work from home', icon: <Laptop className="h-4 w-4" /> },
    ...(canApprove ? [{ to: '/approvals', label: 'Approvals', icon: <CheckSquare className="h-4 w-4" />, badge: awaiting }] : []),
    { to: '/calendar', label: 'Team Calendar', icon: <CalendarDays className="h-4 w-4" /> },
    { to: '/holidays', label: 'Holidays', icon: <CalendarHeart className="h-4 w-4" /> },
  ];
  const people: Item[] = [
    { to: '/directory', label: 'Directory', icon: <Users className="h-4 w-4" /> },
    { to: '/org-chart', label: 'Org Chart', icon: <Network className="h-4 w-4" /> },
    ...(canApprove ? [{ to: '/reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" /> }] : []),
  ];
  const admin: Item[] = me.is_hr
    ? [
        { to: '/admin/employees', label: 'Employees', icon: <Briefcase className="h-4 w-4" /> },
        { to: '/admin/organization', label: 'Departments', icon: <Building2 className="h-4 w-4" /> },
        { to: '/admin/leave-types', label: 'Leave Policies', icon: <ClipboardList className="h-4 w-4" /> },
        { to: '/admin/balances', label: 'Leave Balances', icon: <Wallet className="h-4 w-4" /> },
        { to: '/admin/settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
        { to: '/admin/audit', label: 'Audit Log', icon: <ScrollText className="h-4 w-4" /> },
      ]
    : [];

  const section = (title: string | null, items: Item[]) =>
    items.length > 0 && (
      <div className="mb-5">
        {title && <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</div>}
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            {i.icon}
            <span className="flex-1">{i.label}</span>
            {!!i.badge && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{i.badge}</span>}
          </NavLink>
        ))}
      </div>
    );

  return (
    <div className="min-h-screen lg:flex">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">L</div>
            <div>
              <div className="text-sm font-semibold text-slate-900">LeaveDesk</div>
              <div className="text-[11px] text-slate-500">{me.settings.company_name}</div>
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {section(null, main)}
          {section('People', people)}
          {section('Administration', admin)}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <NavLink to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-100">
            <Avatar person={me} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{me.full_name}</div>
              <div className="truncate text-xs text-slate-500">{me.designation}</div>
            </div>
          </NavLink>
          <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5 text-slate-600" />
          </button>
          <span className="text-sm font-semibold">LeaveDesk</span>
        </header>
        <main key={location.pathname} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
