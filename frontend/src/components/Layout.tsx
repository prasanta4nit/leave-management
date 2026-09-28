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
  LayoutDashboard,
  Laptop,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import type { AnyRequest } from '../lib/types';
import LeaveApplyModal from './LeaveApplyModal';
import TopBar, { type NavPage } from './TopBar';

type Item = NavPage & { badge?: number };

const COLLAPSE_KEY = 'leavedesk.sidebarCollapsed';
const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export default function Layout() {
  const me = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [applying, setApplying] = useState(false);
  const location = useLocation();
  const canApprove = me.is_manager || me.is_hr;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const pending = useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: () => api.get<AnyRequest[]>('/approvals/pending'),
    enabled: canApprove,
    refetchInterval: 60_000,
  });
  const awaiting = pending.data?.filter((p) => p.awaiting_me).length ?? 0;

  const sections: { title: string | null; items: Item[] }[] = [
    {
      title: null,
      items: [
        { to: '/', label: 'My desk', icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
        { to: '/leaves', label: 'My leave', icon: <ClipboardList className="h-[18px] w-[18px]" /> },
        { to: '/wfh', label: 'Work from home', icon: <Laptop className="h-[18px] w-[18px]" /> },
        ...(canApprove ? [{ to: '/approvals', label: 'Approvals', icon: <CheckSquare className="h-[18px] w-[18px]" />, badge: awaiting }] : []),
        { to: '/calendar', label: 'Team calendar', icon: <CalendarDays className="h-[18px] w-[18px]" /> },
        { to: '/holidays', label: 'Holidays', icon: <CalendarHeart className="h-[18px] w-[18px]" /> },
      ],
    },
    {
      title: 'People',
      items: [
        { to: '/directory', label: 'Directory', icon: <Users className="h-[18px] w-[18px]" /> },
        { to: '/org-chart', label: 'Org chart', icon: <Network className="h-[18px] w-[18px]" /> },
        ...(canApprove ? [{ to: '/reports', label: 'Reports', icon: <BarChart3 className="h-[18px] w-[18px]" /> }] : []),
      ],
    },
    {
      title: 'Admin',
      items: me.is_hr
        ? [
            { to: '/admin/employees', label: 'Employees', icon: <Briefcase className="h-[18px] w-[18px]" /> },
            { to: '/admin/organization', label: 'Departments', icon: <Building2 className="h-[18px] w-[18px]" /> },
            { to: '/admin/leave-types', label: 'Leave policies', icon: <SlidersHorizontal className="h-[18px] w-[18px]" /> },
            { to: '/admin/balances', label: 'Leave balances', icon: <Wallet className="h-[18px] w-[18px]" /> },
            { to: '/admin/settings', label: 'Settings', icon: <Settings className="h-[18px] w-[18px]" /> },
            { to: '/admin/audit', label: 'Audit log', icon: <ScrollText className="h-[18px] w-[18px]" /> },
          ]
        : [],
    },
  ];
  const pages: NavPage[] = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title ?? undefined })));

  // On desktop the rail can collapse to icons; the mobile drawer is always full width.
  const rail = collapsed && !mobileOpen;

  return (
    <div className="min-h-screen lg:flex">
      {mobileOpen && <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px] lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-200/70 bg-white transition-all duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:translate-x-0',
          mobileOpen ? 'w-72 translate-x-0' : '-translate-x-full',
          rail ? 'lg:w-[76px]' : 'lg:w-64',
        )}
      >
        <div className={clsx('flex h-16 shrink-0 items-center gap-2.5', rail ? 'justify-center px-2' : 'px-5')}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 font-display text-base font-extrabold text-white shadow-sm shadow-brand-600/30">
            L
          </div>
          {!rail && (
            <div className="min-w-0 flex-1">
              <div className="font-display text-[15px] font-bold leading-tight text-slate-900">LeaveDesk</div>
              <div className="truncate text-[11px] text-slate-500">{me.settings.company_name}</div>
            </div>
          )}
          <button className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {sections.map(
            (s) =>
              s.items.length > 0 && (
                <div key={s.title ?? 'main'} className="mb-5">
                  {s.title && (rail ? <div className="mx-auto mb-2 h-px w-6 bg-slate-200" /> : <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{s.title}</div>)}
                  <div className="space-y-0.5">
                    {s.items.map((i) => (
                      <NavLink
                        key={i.to}
                        to={i.to}
                        end={i.to === '/'}
                        title={rail ? i.label : undefined}
                        className={({ isActive }) =>
                          clsx(
                            'group relative flex items-center gap-3 rounded-xl text-sm font-medium transition',
                            rail ? 'h-11 justify-center' : 'px-3 py-2.5',
                            isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && !rail && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
                            <span className={clsx(isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600')}>{i.icon}</span>
                            {!rail && <span className="flex-1 truncate">{i.label}</span>}
                            {!!i.badge &&
                              (rail ? (
                                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                              ) : (
                                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{i.badge}</span>
                              ))}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ),
          )}
        </nav>

        <div className="hidden shrink-0 border-t border-slate-200/70 p-3 lg:block">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={clsx('flex w-full items-center gap-3 rounded-xl py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800', rail ? 'justify-center' : 'px-3')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
            {!rail && 'Collapse'}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar pages={pages} onMenu={() => setMobileOpen(true)} onApply={() => setApplying(true)} />
        <main key={location.pathname} className="mx-auto max-w-[1400px] animate-fade-up px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
      <LeaveApplyModal open={applying} onClose={() => setApplying(false)} />
    </div>
  );
}
