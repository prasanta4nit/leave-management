import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, ErrorNote, Field } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { confirmPassword, forgotPassword } from '../lib/cognito';
import { config } from '../lib/config';

type DevUser = { email: string; full_name: string; role: string; designation: string | null };

export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">L</div>
          <h1 className="text-2xl font-semibold text-slate-900">LeaveDesk</h1>
          <p className="mt-1 text-sm text-slate-500">Leave & employee management</p>
        </div>
        <div className="card p-6">{config.authMode === 'dev' ? <DevLogin /> : <CognitoLogin />}</div>
      </div>
    </div>
  );
}

function DevLogin() {
  const { loginDev, error } = useAuth();
  const users = useQuery({ queryKey: ['dev-users'], queryFn: () => api.get<DevUser[]>('/auth/dev-users') });
  return (
    <div>
      <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Development mode — pick any employee to sign in as. Configure Cognito for production.
      </p>
      <ErrorNote error={error ?? users.error} />
      <div className="mt-2 max-h-[420px] space-y-1 overflow-y-auto">
        {users.data?.map((u) => (
          <button
            key={u.email}
            onClick={() => loginDev(u.email)}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-100"
          >
            <div>
              <div className="text-sm font-medium text-slate-900">{u.full_name}</div>
              <div className="text-xs text-slate-500">{u.designation}</div>
            </div>
            {u.role !== 'EMPLOYEE' && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">{u.role}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function CognitoLogin() {
  const { loginCognito, refresh, error: authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'newPassword' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [complete, setComplete] = useState<((p: string) => Promise<void>) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLogin = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const r = await loginCognito(email, password);
      if (r.status === 'NEW_PASSWORD_REQUIRED') {
        setComplete(() => r.complete);
        setMode('newPassword');
      }
    });
  };

  return (
    <div className="space-y-4">
      {(error || authError) && <ErrorNote error={error ?? authError} />}
      {info && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}

      {mode === 'login' && (
        <form onSubmit={onLogin} className="space-y-4">
          <Field label="Work email">
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button className="w-full" loading={busy} type="submit">Sign in</Button>
          <button type="button" className="w-full text-center text-sm text-brand-600 hover:underline" onClick={() => setMode('forgot')}>
            Forgot password?
          </button>
        </form>
      )}

      {mode === 'newPassword' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await complete?.(newPassword);
              await refresh();
            });
          }}
          className="space-y-4"
        >
          <p className="text-sm text-slate-600">Welcome! Please choose a new password to finish setting up your account.</p>
          <Field label="New password" hint="At least 8 characters with upper & lower case letters and a number.">
            <input className="input" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </Field>
          <Button className="w-full" loading={busy} type="submit">Set password</Button>
        </form>
      )}

      {mode === 'forgot' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await forgotPassword(email);
              setInfo('We emailed you a verification code.');
              setMode('reset');
            });
          }}
          className="space-y-4"
        >
          <Field label="Work email">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button className="w-full" loading={busy} type="submit">Send reset code</Button>
          <button type="button" className="w-full text-center text-sm text-slate-500 hover:underline" onClick={() => setMode('login')}>Back to sign in</button>
        </form>
      )}

      {mode === 'reset' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await confirmPassword(email, code, newPassword);
              setInfo('Password updated. You can sign in now.');
              setMode('login');
            });
          }}
          className="space-y-4"
        >
          <Field label="Verification code">
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="New password">
            <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </Field>
          <Button className="w-full" loading={busy} type="submit">Reset password</Button>
        </form>
      )}
    </div>
  );
}
