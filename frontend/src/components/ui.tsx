import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { EmployeeBrief, RequestStatus } from '../lib/types';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'soft';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
        {
          primary: 'bg-brand-600 text-white shadow-sm shadow-brand-600/20 hover:bg-brand-700',
          secondary: 'border border-slate-200 bg-white text-slate-700 shadow-card hover:border-slate-300 hover:bg-slate-50',
          danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700',
          success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700',
          ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
          soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        }[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ title, subtitle, icon, action, children, className, bodyClass }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={clsx('card flex min-w-0 flex-col', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>}
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold text-slate-900">{title}</h2>
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className={clsx('flex-1', bodyClass ?? 'p-5')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-card ring-1 ring-slate-200/70 sm:flex">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<string, { cls: string; dot: string }> = {
  PENDING: { cls: 'bg-amber-50 text-amber-700 ring-amber-600/15', dot: 'bg-amber-500' },
  APPROVED: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  REJECTED: { cls: 'bg-rose-50 text-rose-700 ring-rose-600/15', dot: 'bg-rose-500' },
  CANCELLED: { cls: 'bg-slate-100 text-slate-600 ring-slate-500/15', dot: 'bg-slate-400' },
  ACTIVE: { cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15', dot: 'bg-emerald-500' },
  INACTIVE: { cls: 'bg-slate-100 text-slate-600 ring-slate-500/15', dot: 'bg-slate-400' },
};

export function StatusBadge({ status }: { status: RequestStatus | string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.CANCELLED;
  return (
    <Badge className={s.cls}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

export function Badge({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        className ?? 'bg-slate-100 text-slate-700 ring-slate-500/15',
      )}
      style={color ? { backgroundColor: `${color}14`, color: shade(color), boxShadow: `inset 0 0 0 1px ${color}33` } : undefined}
    >
      {children}
    </span>
  );
}

/** Darken a hex colour for readable text on its own tint. */
function shade(hex: string, amount = 0.3): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const AVATAR_COLORS = [
  'from-indigo-500 to-violet-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-rose-500 to-pink-500',
  'from-sky-500 to-cyan-500',
  'from-violet-500 to-fuchsia-500',
  'from-teal-500 to-emerald-600',
  'from-fuchsia-500 to-rose-500',
];

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export function Avatar({ person, size = 'md', ring }: { person: Pick<EmployeeBrief, 'full_name' | 'avatar_url' | 'id'>; size?: AvatarSize; ring?: boolean }) {
  const dims = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-12 w-12 text-sm', xl: 'h-20 w-20 text-xl' }[size];
  const initials = person.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const ringCls = ring && 'ring-2 ring-white';
  if (person.avatar_url) {
    return <img src={person.avatar_url} alt={person.full_name} title={person.full_name} className={clsx(dims, ringCls, 'shrink-0 rounded-full object-cover')} />;
  }
  return (
    <span
      title={person.full_name}
      className={clsx(dims, ringCls, 'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white', AVATAR_COLORS[person.id % AVATAR_COLORS.length])}
    >
      {initials}
    </span>
  );
}

/** Overlapping avatars with a "+N" overflow chip. */
export function AvatarStack({ people, max = 5, size = 'sm' }: { people: Pick<EmployeeBrief, 'full_name' | 'avatar_url' | 'id'>[]; max?: number; size?: AvatarSize }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-2">
      {shown.map((p) => <Avatar key={p.id} person={p} size={size} ring />)}
      {extra > 0 && (
        <span className={clsx('inline-flex items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600 ring-2 ring-white', size === 'xs' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[11px]')}>
          +{extra}
        </span>
      )}
    </div>
  );
}

export function PersonCell({ person, sub }: { person: EmployeeBrief; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar person={person} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-slate-900">{person.full_name}</div>
        <div className="truncate text-xs text-slate-500">{sub ?? person.designation ?? person.email}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx('flex max-h-[92vh] w-full animate-fade-up flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pb-2 pt-5">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 rounded-b-3xl border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center py-12 text-slate-400', className)}>
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
}

/** Placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-2xl bg-slate-200/60', className)} />;
}

export function EmptyState({ icon, title, children, compact }: { icon?: ReactNode; title: string; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={clsx('flex flex-col items-center justify-center px-4 text-center', compact ? 'py-6' : 'py-10')}>
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 max-w-xs text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</div>;
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
};
export type Tone = keyof typeof TONES;

export function IconBubble({ children, tone = 'brand', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone], className)}>{children}</span>;
}

export function StatCard({ label, value, icon, tone = 'brand', hint }: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-500">{label}</div>
          <div className="mt-1 font-display text-[28px] font-bold leading-none text-slate-900">{value}</div>
        </div>
        {icon && <IconBubble tone={tone}>{icon}</IconBubble>}
      </div>
      {hint && <div className="mt-2 truncate text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Tabs. `pill` renders a segmented control; default is an underline tab bar. */
export function Tabs<T extends string>({ tabs, value, onChange, variant = 'line' }: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  variant?: 'line' | 'pill';
}) {
  if (variant === 'pill') {
    return (
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-200/60 p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => onChange(t.value)}
            className={clsx(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
              value === t.value ? 'bg-white text-slate-900 shadow-card' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition',
            value === t.value ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx('relative h-6 w-10 shrink-0 rounded-full transition', checked ? 'bg-brand-600' : 'bg-slate-300')}
      >
        <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

/** Compact country code tag (emoji flags don't render on Windows). */
export function CountryTag({ code, title }: { code: string | null | undefined; title?: string }) {
  if (!code) return null;
  return (
    <span title={title ?? code} className="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-1 py-px text-[10px] font-semibold tracking-wide text-slate-600 ring-1 ring-inset ring-slate-300/60">
      {code}
    </span>
  );
}

/**
 * Circular meter. `value` / `max` fills the ring; `secondary` (e.g. pending) is drawn as a lighter
 * segment after it. Text inside is passed as children so numbers stay in text colours.
 */
export function ProgressRing({ value, max, secondary = 0, color, size = 88, stroke = 9, children }: {
  value: number;
  max: number;
  secondary?: number;
  color: string;
  size?: number;
  stroke?: number;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const frac2 = max > 0 ? Math.min(1 - frac, Math.max(0, secondary / max)) : 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f4" strokeWidth={stroke} />
        {frac2 > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={stroke}
            strokeDasharray={`${frac2 * c} ${c}`} strokeDashoffset={-frac * c} strokeLinecap="round"
          />
        )}
        {frac > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${frac * c} ${c}`} strokeLinecap="round" className="transition-[stroke-dasharray] duration-500"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}
