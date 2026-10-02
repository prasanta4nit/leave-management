import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, FlaskConical, Globe, Palmtree, Search } from 'lucide-react';
import { Avatar, Badge, Button, CountryTag, ErrorNote, Field } from '../components/ui';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { confirmPassword, describeAuthError, forgotPassword } from '../lib/cognito';
import { config } from '../lib/config';

type DevUser = { id: number; email: string; full_name: string; role: string; designation: string | null; country_code: string | null };

const HIGHLIGHTS = [
  { icon: <Palmtree className="h-4 w-4" />, text: 'Apply for leave in seconds, with balances that update live' },
  { icon: <CheckCircle2 className="h-4 w-4" />, text: 'Approvals by email, with a full audit trail' },
  { icon: <Globe className="h-4 w-4" />, text: 'Holidays and leave policies for every country you work in' },
];

export default function Login() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-700 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -left-20 top-1/3 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-96 w-96 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-display text-lg font-extrabold text-brand-700">E</div>
          <span className="font-display text-xl font-bold">Employee Desk</span>
        </div>
        <div className="relative my-auto max-w-md">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">Your time off,<br />without the paperwork.</h1>
          <p className="mt-4 text-lg text-indigo-100">One place for leave, work-from-home, holidays and your team's calendar.</p>
          <ul className="mt-10 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text} className="flex items-center gap-3 text-[15px] text-indigo-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-inset ring-white/20">{h.icon}</span>
                {h.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-indigo-200">Leave & employee management</p>
      </aside>

      <main className="flex items-center justify-center bg-canvas px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 font-display text-lg font-extrabold text-white">E</div>
            <span className="font-display text-xl font-bold text-slate-900">Employee Desk</span>
          </div>
          {config.authMode === 'dev' ? <DevLogin /> : <CognitoLogin />}
        </div>
      </main>
    </div>
  );
}

function DevLogin() {
  const { loginDev, error } = useAuth();
  const [q, setQ] = useState('');
  const users = useQuery({ queryKey: ['dev-users'], queryFn: () => api.get<DevUser[]>('/auth/dev-users') });
  const term = q.trim().toLowerCase();
  const list = (users.data ?? []).filter((u) => !term || `${u.full_name} ${u.designation ?? ''} ${u.role} ${u.country_code ?? ''}`.toLowerCase().includes(term));
  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-slate-900">Welcome back</h2>
      <p className="mt-1 text-sm text-slate-500">Choose who to sign in as.</p>
      <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-600/15">
        <FlaskConical className="mt-px h-4 w-4 shrink-0" />
        Development mode: there are no passwords here. Configure Cognito before deploying.
      </p>
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search by name, role or country" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="mt-3"><ErrorNote error={error ?? users.error} /></div>
      <div className="card mt-3 max-h-[440px] overflow-y-auto p-1.5">
        {list.map((u) => (
          <button
            key={u.email}
            onClick={() => loginDev(u.email)}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50"
          >
            <Avatar person={{ ...u, avatar_url: null }} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-900">{u.full_name}</div>
              <div className="truncate text-xs text-slate-500">{u.designation}</div>
            </div>
            <CountryTag code={u.country_code} />
            {u.role !== 'EMPLOYEE' && <Badge className="bg-brand-50 text-brand-700 ring-brand-600/15">{u.role === 'ADMIN' ? 'Admin' : 'HR'}</Badge>}
            <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
          </button>
        ))}
        {users.data && !list.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No one matches “{q}”.</p>}
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
      setError(describeAuthError(e));
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
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">
          {mode === 'newPassword' ? 'Set your password' : mode === 'login' ? 'Welcome back' : 'Reset your password'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Sign in with your work email.' : "We'll get you back in."}</p>
      </div>
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
              const sentTo = await forgotPassword(email);
              setInfo(`We emailed a verification code to ${sentTo ?? email}. It can take a minute; check your spam folder too.`);
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
