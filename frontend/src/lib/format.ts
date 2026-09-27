import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { AnyRequest, LeaveRequest } from './types';

export const toDate = (s: string) => parseISO(s.length === 10 ? s : s.endsWith('Z') ? s : `${s}Z`);

export const fmtDate = (s: string | null | undefined, pattern = 'dd MMM yyyy') => (s ? format(toDate(s), pattern) : '—');

export const fmtDateTime = (s: string | null | undefined) => (s ? format(toDate(s), 'dd MMM yyyy, HH:mm') : '—');

export const fromNow = (s: string) => formatDistanceToNow(toDate(s), { addSuffix: true });

export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');

export const fmtDays = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '∞';
  const v = Math.round(n * 100) / 100;
  return `${v} day${v === 1 ? '' : 's'}`;
};

export function dateRange(r: { start_date: string; end_date: string }) {
  if (r.start_date === r.end_date) return fmtDate(r.start_date, 'EEE, dd MMM yyyy');
  const s = toDate(r.start_date);
  const e = toDate(r.end_date);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${format(s, sameYear ? 'dd MMM' : 'dd MMM yyyy')} – ${format(e, 'dd MMM yyyy')}`;
}

export function durationLabel(r: LeaveRequest) {
  if (r.duration_type === 'HALF_DAY') return `Half day (${r.half_day_session === 'FIRST_HALF' ? '1st half' : '2nd half'})`;
  return fmtDays(r.total_days);
}

export const requestTitle = (r: AnyRequest) =>
  r.kind === 'LEAVE' ? r.leave_type.name : 'Work from home';

export const kindLabel = { LEAVE: 'Leave', WFH: 'WFH' } as const;

export const titleCase = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
