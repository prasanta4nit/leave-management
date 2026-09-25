import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Approvals from './pages/Approvals';
import CalendarPage from './pages/Calendar';
import Dashboard from './pages/Dashboard';
import Directory from './pages/Directory';
import EmployeeProfile from './pages/EmployeeProfile';
import Holidays from './pages/Holidays';
import Leaves from './pages/Leaves';
import Login from './pages/Login';
import MyProfile from './pages/MyProfile';
import OrgChart from './pages/OrgChart';
import Reports from './pages/Reports';
import Wfh from './pages/Wfh';
import AdminEmployees from './pages/admin/Employees';
import AuditLog from './pages/admin/AuditLog';
import Balances from './pages/admin/Balances';
import LeaveTypes from './pages/admin/LeaveTypes';
import Organization from './pages/admin/Organization';
import SettingsPage from './pages/admin/Settings';

function Guard({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { me, loading } = useAuth();
  if (loading) return <Spinner className="h-screen" />;
  if (!me) return <Login />;
  const approver = me.is_manager || me.is_hr;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="leaves" element={<Leaves />} />
        <Route path="wfh" element={<Wfh />} />
        <Route path="approvals" element={<Guard when={approver}><Approvals /></Guard>} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="holidays" element={<Holidays />} />
        <Route path="directory" element={<Directory />} />
        <Route path="org-chart" element={<OrgChart />} />
        <Route path="employees/:id" element={<EmployeeProfile />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="reports" element={<Guard when={approver}><Reports /></Guard>} />
        <Route path="admin/employees" element={<Guard when={me.is_hr}><AdminEmployees /></Guard>} />
        <Route path="admin/organization" element={<Guard when={me.is_hr}><Organization /></Guard>} />
        <Route path="admin/leave-types" element={<Guard when={me.is_hr}><LeaveTypes /></Guard>} />
        <Route path="admin/balances" element={<Guard when={me.is_hr}><Balances /></Guard>} />
        <Route path="admin/settings" element={<Guard when={me.is_hr}><SettingsPage /></Guard>} />
        <Route path="admin/audit" element={<Guard when={me.is_hr}><AuditLog /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
