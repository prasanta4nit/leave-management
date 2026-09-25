import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, devUser } from './api';
import { config } from './config';
import * as cognito from './cognito';
import type { Me } from './types';

interface AuthState {
  me: Me | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loginDev: (email: string) => Promise<void>;
  loginCognito: (email: string, password: string) => Promise<cognito.SignInResult>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    const signedIn = config.authMode === 'dev' ? !!devUser.get() : !!(await cognito.currentSession());
    if (!signedIn) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.get<Me>('/auth/me'));
      setError(null);
    } catch (e) {
      setMe(null);
      setError(e instanceof ApiError ? e.message : 'Unable to reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loginDev = async (email: string) => {
    devUser.set(email);
    qc.clear();
    setLoading(true);
    await refresh();
  };

  const loginCognito = async (email: string, password: string) => {
    const result = await cognito.signIn(email, password);
    if (result.status === 'SIGNED_IN') {
      qc.clear();
      await refresh();
    }
    return result;
  };

  const logout = () => {
    if (config.authMode === 'dev') devUser.set(null);
    else cognito.signOut();
    qc.clear();
    setMe(null);
  };

  return (
    <AuthContext.Provider value={{ me, loading, error, refresh, loginDev, loginCognito, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Non-null current user for pages rendered behind the auth guard. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Not signed in');
  return me;
}
