import { useState } from 'react';

/** Single-series bar chart (one hue, labeled axis, per-bar hover value). */
export function ColumnChart({ data, unit = 'days', height = 160 }: { data: { label: string; value: number }[]; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div className="relative flex items-end gap-1.5 border-b border-slate-200" style={{ height }}>
        {data.map((d, i) => (
          <div
            key={d.label}
            className="group relative flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className="w-full rounded-t bg-brand-500 transition-opacity"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0, opacity: hover === null || hover === i ? 1 : 0.45 }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow">
                {d.label}: <strong>{d.value}</strong> {unit}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[10px] text-slate-500">{d.label}</div>
        ))}
      </div>
    </div>
  );
}

/** Horizontal bars with the category label and value as text (identity is never color-only). */
export function BarList({ data, unit }: { data: { label: string; value: number; dot?: string }[]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} title={`${d.label}: ${d.value}${unit ? ` ${unit}` : ''}`}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              {d.dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.dot }} />}
              {d.label}
            </span>
            <span className="font-medium text-slate-900">{d.value}{unit ? <span className="ml-1 text-xs font-normal text-slate-500">{unit}</span> : null}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
