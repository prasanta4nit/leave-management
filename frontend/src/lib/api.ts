import { config } from './config';
import { getIdToken } from './cognito';

const DEV_USER_KEY = 'leavedesk.devUser';

export const devUser = {
  get: (): string | null => {
    try {
      return localStorage.getItem(DEV_USER_KEY);
    } catch {
      return null;
    }
  },
  set: (email: string | null) => {
    try {
      if (email) localStorage.setItem(DEV_USER_KEY, email);
      else localStorage.removeItem(DEV_USER_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  if (config.authMode === 'dev') {
    const email = devUser.get();
    return email ? { 'X-Dev-User': email } : {};
  }
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // Pydantic validation errors
      return detail
        .map((d: { msg?: string; loc?: unknown[] }) => (d.msg ?? '').replace(/^Value error, /, ''))
        .join('; ');
    }
  }
  return fallback;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, errorMessage(parsed, `Request failed (${res.status})`));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};

/** Download a CSV/XLSX export produced by the API. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, { headers: await authHeaders() });
  if (!res.ok) throw new ApiError(res.status, `Export failed (${res.status})`);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!entries.length) return '';
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}
