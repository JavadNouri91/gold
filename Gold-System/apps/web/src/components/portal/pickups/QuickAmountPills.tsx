'use client';

import { cn } from '@/lib/utils';

const DENOMINATIONS = [1, 2, 5, 10, 20, 50] as const;

export interface QuickAmountPillsProps {
  availableWeightGrams: number;
  value: number;
  onChange: (grams: number) => void;
  disabled?: boolean;
}

export function QuickAmountPills({
  availableWeightGrams,
  value,
  onChange,
  disabled,
}: QuickAmountPillsProps) {
  const maxWholeGrams = Number.isFinite(availableWeightGrams)
    ? Math.max(0, Math.floor(availableWeightGrams))
    : 0;
  return (
    <div dir="rtl" role="group" aria-label="انتخاب سریع وزن" className="flex flex-wrap gap-2">
      {[...DENOMINATIONS.filter((grams) => grams <= maxWholeGrams), maxWholeGrams].map(
        (grams, index, options) => {
          const maximum = index === options.length - 1;
          const active = grams > 0 && value === grams;
          return (
            <button
              key={maximum ? 'maximum' : grams}
              type="button"
              aria-pressed={active}
              disabled={disabled || grams < 1}
              onClick={() => onChange(grams)}
              className={cn(
                'min-h-11 rounded-lg border px-3 py-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50',
                active
                  ? 'border-amber-500 bg-amber-100 text-amber-950'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-amber-400 hover:bg-amber-50',
                maximum && !active && 'border-amber-300 text-amber-900',
              )}
            >
              {maximum ? (
                <>
                  کل سهمیه{' '}
                  <span className="ms-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900">
                    ({grams.toLocaleString('fa-IR')} گرم)
                  </span>
                </>
              ) : (
                `${grams.toLocaleString('fa-IR')} گرم`
              )}
            </button>
          );
        },
      )}
    </div>
  );
}
