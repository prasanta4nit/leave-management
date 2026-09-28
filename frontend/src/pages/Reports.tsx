import { useQuery } from '@tanstack/react-query';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, EmptyState, PageHeader, Spinner, Tabs } from '../components/ui';
import { api, download, qs } from '../lib/api';
import { useMe } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Department, Employee, ReportResult } from '../lib/types';

type Report = 'utilization' | 'employee-history' | 'department' | 'monthly';

const REPORTS: { value: Report; label: string; description: string }[] = [
  { value: 'utilization', label: 'Leave utilization', description: 'Credited, used, pending and available days per employee and leave type.' },
  { value: 'employee-history', label: 'Employee leave history', description: 'Every leave request with its approval outcome.' },
  { value: 'department', label: 'Department-wise', description: 'Approved leave days per department and leave type.' },
  { value: 'monthly', label: 'Monthly / yearly', description: 'Approved leave days per month, or a per-employee breakdown for one month.' },
];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Reports() {
  const me = useMe();
  const toast = useToast();
  const thisYear = new Date().getFullYear();
  const [report, setReport] = useState<Report>('utilization');
  const [year, setYear] = useState(thisYear);
  const [dept, setDept] = useState<number | ''>('');
  const [employee, setEmployee] = useState<number | ''>('');
  const [status, setStatus] = useState('');
  const [month, setMonth] = useState<number | ''>('');
  const [exporting, setExporting] = useState<string | null>(null);

  const params = {
    year,
    department_id: report === 'utilization' || report === 'employee-history' ? dept : undefined,
    employee_id: report === 'employee-history' ? employee : undefined,
    status: report === 'employee-history' ? status : undefined,
    month: report === 'monthly' ? month : undefined,
  };
  const q = useQuery({
    queryKey: ['report', report, params],
    queryFn: () => api.get<ReportResult>(`/reports/${report}${qs(params)}`),
  });
  const depts = useQuery({ queryKey: ['departments'], queryFn: () => api.get<Department[]>('/departments') });
  const employees = useQuery({ queryKey: ['employees', 'report-picker'], queryFn: () => api.get<Employee[]>('/employees?status=ALL') });

  const exportAs = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      await download(`/reports/${report}${qs({ ...params, format })}`, `${report}-${year}.${format}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setExporting(null);
    }
  };

  const current = REPORTS.find((r) => r.value === report)!;
  const numeric = (v: unknown) => typeof v === 'number';

  return (
    <div>
      <PageHeader
        icon={<BarChart3 className="h-5 w-5" />}
        title="Reports"
        subtitle={me.is_hr ? 'Organization-wide leave analytics' : 'Leave analytics for your reporting team'}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportAs('csv')} loading={exporting === 'csv'}><Download className="h-4 w-4" /> CSV</Button>
            <Button variant="secondary" onClick={() => exportAs('xlsx')} loading={exporting === 'xlsx'}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
          </>
        }
      />
      <Tabs tabs={REPORTS.map((r) => ({ value: r.value, label: r.label }))} value={report} onChange={setReport} />
      <p className="mb-4 text-sm text-slate-500">{current.description}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {(report === 'utilization' || report === 'employee-history') && (
          <select className="input w-auto" value={dept} onChange={(e) => setDept(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All departments</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
        {report === 'employee-history' && (
          <>
            <select className="input w-auto" value={employee} onChange={(e) => setEmployee(e.target.value ? Number(e.target.value) : '')}>
              <option value="">All employees</option>
              {employees.data?.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
          </>
        )}
        {report === 'monthly' && (
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Whole year (by month)</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        )}
      </div>
      <Card bodyClass="p-0">
        {q.isLoading ? (
          <Spinner />
        ) : !q.data?.rows.length ? (
          <EmptyState title="No data for these filters" />
        ) : (
          <div className="max-h-[65vh] overflow-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="sticky top-0 bg-slate-50">
                <tr>{q.data.columns.map((c) => <th key={c.key} className="table-th whitespace-nowrap">{c.label}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {q.data.columns.map((c) => (
                      <td key={c.key} className={`table-td whitespace-nowrap ${numeric(r[c.key]) ? 'text-right tabular-nums' : ''}`}>
                        {r[c.key] === null || r[c.key] === '' ? <span className="text-slate-300">—</span> : String(r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {q.data && <p className="mt-2 text-xs text-slate-500">{q.data.rows.length} rows</p>}
    </div>
  );
}
