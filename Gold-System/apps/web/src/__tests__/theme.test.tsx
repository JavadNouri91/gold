import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../components/theme-provider';
import { ThemeSegmentedControl } from '../components/theme-toggle';
import { ProfilePreferences } from '../components/portal/profile/profile-preferences';
import {
  applyResolvedTheme,
  persistTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../lib/theme';

describe('theme helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light and resolves system from matchMedia', () => {
    expect(readStoredTheme()).toBe('light');
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('persists preference and applies the dark class', () => {
    persistTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    applyResolvedTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyResolvedTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('theme controls', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('lets the user pick dark appearance from settings', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ProfilePreferences />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('radio', { name: 'تاریک' }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByText('حالت تاریک سامانه')).toBeInTheDocument();
  });

  it('marks the selected appearance option', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeSegmentedControl />
      </ThemeProvider>,
    );

    const light = screen.getByRole('radio', { name: 'روشن' });
    const dark = screen.getByRole('radio', { name: 'تاریک' });
    expect(light).toHaveAttribute('aria-checked', 'true');

    await act(async () => {
      await user.click(dark);
    });
    expect(dark).toHaveAttribute('aria-checked', 'true');
  });
});
