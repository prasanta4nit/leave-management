import { useState, type ReactNode } from 'react';

/**
 * Single-series column chart: one hue, recessive gridlines, labelled axis and a hover tooltip.
 * Each datum needs a unique `key` (labels like month initials repeat).
 */
export function ColumnChart({ data, unit = 'days', height = 200 }: {
  data: { key: string; label: string; title?: string; value: number }[];
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-slate-400" style={{ height: height + 20 }}>
        {ticks.map((t) => <span key={t} className="-translate-y-1.5 leading-none">{fmt(t)}</span>)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-dashed border-slate-200" style={{ top: `${(1 - t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2.5">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="relative flex h-full flex-1 cursor-default items-end justify-center"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <div
                  className="w-full max-w-[36px] rounded-t-[4px] bg-brand-500 transition-all"
                  style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0, opacity: hover === null || hover === i ? 1 : 0.4 }}
                />
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg">
                    {d.title ?? d.label}: <strong>{fmt(d.value)}</strong> {unit}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex gap-1.5 sm:gap-2.5">
          {data.map((d, i) => (
            <div key={d.key} className={`flex-1 text-center text-[11px] ${hover === i ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>{d.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal bars with the label and value as text, so identity never depends on colour alone. */
export function BarList({ data, unit }: { data: { key: string; label: ReactNode; value: number; dot?: string }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-slate-700">
              {d.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.dot }} />}
              <span className="flex min-w-0 items-center gap-1.5 truncate">{d.label}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {fmt(d.value)}
              {unit ? <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span> : null}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500 transition-all" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 4;
  const step = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / step;
  const nice = [1, 2, 4, 5, 6, 8, 10].find((x) => x >= n) ?? 10;
  return nice * step;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
