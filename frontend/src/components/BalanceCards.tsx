import { Infinity as InfinityIcon } from 'lucide-react';
import type { Balance } from '../lib/types';
import { ProgressRing } from './ui';

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Leave balances as rings: the coloured arc is what's still available, the faint arc is pending
 * requests, and the grey track is what's been used.
 */
export default function BalanceCards({ balances, compact }: { balances: Balance[]; compact?: boolean }) {
  return (
    <div className={compact ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'}>
      {balances.map((b) => (
        <div key={b.leave_type_id} className="card flex items-center gap-4 p-4 transition hover:shadow-lift">
          {b.is_unlimited ? (
            <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${b.color}12`, color: b.color }}>
              <InfinityIcon className="h-7 w-7" />
            </div>
          ) : (
            <ProgressRing value={Math.max(0, b.available ?? 0)} secondary={b.pending} max={b.credited} color={b.color} size={76} stroke={7}>
              <span className="font-display text-xl font-bold leading-none text-slate-900">{round(b.available ?? 0)}</span>
              <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-400">left</span>
            </ProgressRing>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{b.leave_type_name}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {b.is_unlimited ? 'No fixed limit' : <>of <span className="font-medium text-slate-700">{round(b.credited)}</span> days{b.carried_forward ? ` · ${round(b.carried_forward)} carried over` : ''}</>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="text-slate-500"><span className="font-semibold tabular-nums text-slate-700">{round(b.used)}</span> used</span>
              <span className="text-slate-500"><span className="font-semibold tabular-nums text-slate-700">{round(b.pending)}</span> pending</span>
            </div>
            {!b.applicable ? (
              <div className="mt-1.5 text-[11px] font-medium text-amber-600" title="Not part of the current country policy; shown because it was used this year">
                Previous country policy
              </div>
            ) : !b.is_paid ? (
              <div className="mt-1.5 text-[11px] font-medium text-slate-400">Unpaid</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
