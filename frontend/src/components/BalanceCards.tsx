import type { Balance } from '../lib/types';

export default function BalanceCards({ balances, compact }: { balances: Balance[]; compact?: boolean }) {
  const visible = balances.filter((b) => !(b.leave_type_code && b.credited === 0 && b.used === 0 && b.pending === 0 && !b.is_unlimited && b.annual_quota === 0));
  return (
    <div className={compact ? 'grid grid-cols-2 gap-3 md:grid-cols-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'}>
      {visible.map((b) => {
        const pctUsed = b.credited > 0 ? Math.min(100, (b.used / b.credited) * 100) : 0;
        const pctPending = b.credited > 0 ? Math.min(100 - pctUsed, (b.pending / b.credited) * 100) : 0;
        return (
          <div key={b.leave_type_id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
                <span className="text-sm font-medium text-slate-700">{b.leave_type_name}</span>
              </div>
              {!b.is_paid && <span className="text-[10px] font-semibold uppercase text-slate-400">Unpaid</span>}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-slate-900">{b.is_unlimited ? '∞' : round(b.available ?? 0)}</span>
              <span className="text-sm text-slate-500">{b.is_unlimited ? 'no limit' : `of ${round(b.credited)} available`}</span>
            </div>
            {!b.is_unlimited && (
              <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-slate-100" title={`Used ${b.used}, pending ${b.pending}`}>
                <div style={{ width: `${pctUsed}%`, backgroundColor: b.color }} />
                <div style={{ width: `${pctPending}%`, backgroundColor: b.color, opacity: 0.35 }} />
              </div>
            )}
            {!compact && (
              <dl className="mt-3 grid grid-cols-3 gap-1 text-xs">
                <Stat label="Used" value={b.used} />
                <Stat label="Pending" value={b.pending} />
                <Stat label={b.carried_forward ? 'Carried fwd' : 'Accrued'} value={b.carried_forward || b.accrued || b.allocated + b.adjusted} />
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{round(value)}</dd>
    </div>
  );
}
