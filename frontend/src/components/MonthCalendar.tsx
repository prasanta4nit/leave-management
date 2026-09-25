import clsx from 'clsx';
import { addDays, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { useState } from 'react';
import { isoDate } from '../lib/format';
import type { CalendarData, RequestKind } from '../lib/types';
import RequestDetailModal from './RequestDetailModal';

/** Month grid showing holidays, leave and WFH entries. */
export default function MonthCalendar({ month, data, onDayClick }: {
  month: Date;
  data?: CalendarData;
  onDayClick?: (date: string) => void;
}) {
  const [open, setOpen] = useState<{ kind: RequestKind; id: number } | null>(null);
  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  // Python weekday numbers (Mon=0) -> JS getDay (Sun=0)
  const weekend = new Set((data?.weekend_days ?? [5, 6]).map((w) => (w + 1) % 7));

  const entriesFor = (iso: string) => {
    const holidays = data?.holidays.filter((h) => h.date === iso) ?? [];
    const leaves = data?.leaves.filter((l) => l.start_date <= iso && l.end_date >= iso) ?? [];
    const wfh = data?.wfh.filter((w) => w.start_date <= iso && w.end_date >= iso) ?? [];
    return { holidays, leaves, wfh };
  };

  return (
    <>
      <div className="grid grid-cols-7 border-l border-t border-slate-200 text-xs">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="border-b border-r border-slate-200 bg-slate-50 px-2 py-1.5 text-center font-semibold text-slate-500">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const iso = isoDate(d);
          const { holidays, leaves, wfh } = entriesFor(iso);
          const off = weekend.has(d.getDay());
          const mandatoryHoliday = holidays.some((h) => !h.is_optional);
          const items = [
            ...leaves.map((l) => ({
              key: `l${l.id}`,
              label: l.employee.first_name + (l.duration_type !== 'FULL_DAY' ? ' ½' : ''),
              title: `${l.employee.full_name} — ${l.leave_type.name}${l.status === 'PENDING' ? ' (pending)' : ''}`,
              color: l.leave_type.color,
              pending: l.status === 'PENDING',
              onClick: () => setOpen({ kind: 'LEAVE', id: l.id }),
            })),
            ...wfh.map((w) => ({
              key: `w${w.id}`,
              label: `${w.employee.first_name} · WFH`,
              title: `${w.employee.full_name} — Work from home${w.status === 'PENDING' ? ' (pending)' : ''}`,
              color: '#0ea5e9',
              pending: w.status === 'PENDING',
              onClick: () => setOpen({ kind: 'WFH', id: w.id }),
            })),
          ];
          return (
            <div
              key={iso}
              onClick={() => onDayClick?.(iso)}
              className={clsx(
                'min-h-[92px] border-b border-r border-slate-200 p-1.5',
                !isSameMonth(d, month) && 'bg-slate-50/70 text-slate-400',
                (off || mandatoryHoliday) && isSameMonth(d, month) && 'bg-slate-50',
                onDayClick && 'cursor-pointer hover:bg-brand-50/40',
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={clsx(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday(d) ? 'bg-brand-600 font-semibold text-white' : 'text-slate-600',
                  )}
                >
                  {format(d, 'd')}
                </span>
              </div>
              <div className="space-y-0.5">
                {holidays.map((h) => (
                  <div
                    key={h.id}
                    title={h.name + (h.is_optional ? ' (optional)' : '')}
                    className={clsx(
                      'truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                      h.is_optional ? 'border border-dashed border-rose-300 text-rose-600' : 'bg-rose-100 text-rose-700',
                    )}
                  >
                    {h.name}
                  </div>
                ))}
                {items.slice(0, 3).map((i) => (
                  <button
                    key={i.key}
                    title={i.title}
                    onClick={(e) => {
                      e.stopPropagation();
                      i.onClick();
                    }}
                    className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium"
                    style={{
                      backgroundColor: i.pending ? 'transparent' : `${i.color}22`,
                      color: i.color,
                      border: i.pending ? `1px dashed ${i.color}` : '1px solid transparent',
                    }}
                  >
                    {i.label}
                  </button>
                ))}
                {items.length > 3 && <div className="px-1 text-[11px] text-slate-500">+{items.length - 3} more</div>}
              </div>
            </div>
          );
        })}
      </div>
      <RequestDetailModal kind={open?.kind ?? 'LEAVE'} id={open?.id ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
