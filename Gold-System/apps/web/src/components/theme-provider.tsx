'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  applyResolvedTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggleLightDark: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('light');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  const apply = useCallback((next: ThemePreference) => {
    const value = resolveTheme(next);
    setPreferenceState(next);
    setResolved(value);
    applyResolvedTheme(value);
  }, []);

  useEffect(() => {
    apply(readStoredTheme());
  }, [apply]);

  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [apply, preference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      persistTheme(next);
      apply(next);
    },
    [apply],
  );

  const toggleLightDark = useCallback(() => {
    const next: ThemePreference = resolved === 'dark' ? 'light' : 'dark';
    persistTheme(next);
    apply(next);
  }, [apply, resolved]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggleLightDark }),
    [preference, resolved, setPreference, toggleLightDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
