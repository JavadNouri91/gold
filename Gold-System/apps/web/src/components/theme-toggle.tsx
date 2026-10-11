'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { THEME_LABELS, THEME_PREFERENCES, type ThemePreference } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTION_ICONS: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function ThemeCycleButton({ className }: { className?: string }) {
  const { resolved, toggleLightDark } = useTheme();
  const nextLabel = resolved === 'dark' ? 'روشن' : 'تاریک';
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-11 w-11 shrink-0 text-slate-600', className)}
      onClick={toggleLightDark}
      aria-label={`تغییر به حالت ${nextLabel}`}
      title={`حالت ${THEME_LABELS[resolved]}`}
    >
      {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function ThemeSegmentedControl() {
  const { preference, setPreference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="ظاهر برنامه"
      className="flex shrink-0 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5"
    >
      {THEME_PREFERENCES.map((option) => {
        const Icon = OPTION_ICONS[option];
        const selected = preference === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={THEME_LABELS[option]}
            onClick={() => setPreference(option)}
            className={cn(
              'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[#667085] transition-colors',
              selected && 'bg-white text-[#172033] shadow-sm',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">{THEME_LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
