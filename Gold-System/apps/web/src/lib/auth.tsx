'use client';

/**
 * Auth Context
 *
 * Provides authentication state to the entire portal.
 * Stores tokens in localStorage; all auth operations go through authApi.
 *
 * SECURITY NOTE: localStorage is acceptable for an MVP SPA. In production,
 * access tokens should be stored in memory and refresh tokens in httpOnly
 * cookies. Backend authorization remains the security boundary.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { authApi, tokenStore, type OtpResponse } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  mobile: string;
  roles: string[];
  permissions: string[];
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (mobile: string, password: string) => Promise<{ requiresOtp: boolean }>;
  verifyOtp: (mobile: string, code: string) => Promise<void>;
  confirmSession: (confirmationToken: string, revokeSessionId: string) => Promise<void>;
  closeOtherSessions: (confirmationToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'gold_user';

function loadStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from storage on mount
  useEffect(() => {
    const storedUser = loadStoredUser();
    const accessToken = tokenStore.getAccess();
    if (storedUser && accessToken) {
      setUser(storedUser);
    } else {
      // Clear stale state
      tokenStore.clear();
      localStorage.removeItem(USER_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (mobile: string, password: string) => {
    const result = await authApi.login(mobile, password);
    return { requiresOtp: result.requiresOtp ?? true };
  }, []);

  const applySession = useCallback((resp: OtpResponse) => {
    tokenStore.setAccess(resp.accessToken);
    tokenStore.setRefresh(resp.refreshToken);
    const authUser: AuthUser = {
      id: resp.user.id,
      mobile: resp.user.mobile,
      roles: resp.user.roles,
      permissions: resp.user.permissions,
    };
    storeUser(authUser);
    setUser(authUser);
  }, []);

  const verifyOtp = useCallback(async (mobile: string, code: string) => {
    applySession(await authApi.verifyOtp(mobile, code));
  }, [applySession]);

  const confirmSession = useCallback(async (confirmationToken: string, revokeSessionId: string) => {
    applySession(await authApi.confirmSession(confirmationToken, revokeSessionId));
  }, [applySession]);

  const closeOtherSessions = useCallback(async (confirmationToken: string) => {
    applySession(await authApi.closeOtherSessions(confirmationToken));
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors; clear state regardless
    }
    tokenStore.clear();
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_KEY);
    }
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    verifyOtp,
    confirmSession,
    closeOtherSessions,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
