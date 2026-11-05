'use client';

/** Shared portal authentication: memory-only access token and HttpOnly refresh cookie. */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi, tokenStore, refreshSession, type OtpResponse } from './api';

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
  applySession: (response: OtpResponse) => void;
  login: (mobile: string, password: string) => Promise<{ requiresOtp: boolean }>;
  verifyOtp: (mobile: string, code: string) => Promise<void>;
  confirmSession: (confirmationToken: string, revokeSessionId: string) => Promise<void>;
  closeOtherSessions: (confirmationToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'gold_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    refreshSession()
      .then((result) => {
        if (active) setUser(result.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
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
    setUser(authUser);
  }, []);

  const login = useCallback(
    async (mobile: string, password: string) => {
      const result = await authApi.login(mobile, password);
      if (result.accessToken && result.user) {
        applySession({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresIn: result.expiresIn ?? 0,
          user: result.user,
        });
        return { requiresOtp: false };
      }
      return { requiresOtp: result.requiresOtp ?? true };
    },
    [applySession],
  );

  const verifyOtp = useCallback(
    async (mobile: string, code: string) => {
      applySession(await authApi.verifyOtp(mobile, code));
    },
    [applySession],
  );

  const confirmSession = useCallback(
    async (confirmationToken: string, revokeSessionId: string) => {
      applySession(await authApi.confirmSession(confirmationToken, revokeSessionId));
    },
    [applySession],
  );

  const closeOtherSessions = useCallback(
    async (confirmationToken: string) => {
      applySession(await authApi.closeOtherSessions(confirmationToken));
    },
    [applySession],
  );

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
    applySession,
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
