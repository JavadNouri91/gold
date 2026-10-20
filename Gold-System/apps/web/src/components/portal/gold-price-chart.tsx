'use client';

import { useId, useMemo } from 'react';
import { rialToToman, toPersianDigits } from '@/lib/utils';
import { CHART_PERIOD_LABELS, type ChartPeriod } from '@/lib/portal-demo';

function tomanAxisLabel(rial: number): string {
  const toman = rialToToman(String(Math.round(rial)));
  if (toman == null) return toPersianDigits(String(Math.round(rial / 10)));
  const whole = toman.split('.')[0] ?? '0';
  return toPersianDigits(whole.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

export function GoldPriceChart({
  series,
  period,
  compact = false,
}: {
  series: number[];
  period: ChartPeriod;
  compact?: boolean;
}) {
  const gradId = useId().replace(/:/g, '');
  const { path, area, min, max } = useMemo(() => buildPath(series), [series]);
  // Series stays in Rial for shape; axis labels show Toman.
  const minLabel = tomanAxisLabel(min);
  const maxLabel = tomanAxisLabel(max);

  return (
    <div className={compact ? 'mt-3' : 'mt-4'}>
      {compact ? null : (
        <p className="mb-1 text-[11px] text-muted-foreground">
          نمودار نمایشی حول قیمت مرجع — {CHART_PERIOD_LABELS[period]}
        </p>
      )}
      <div
        className={
          compact
            ? 'relative h-14 w-full overflow-hidden rounded-xl bg-gold-50/40'
            : 'relative h-36 w-full overflow-hidden rounded-xl bg-gold-50/40'
        }
      >
        <svg viewBox="0 0 400 140" className="h-full w-full" role="img" aria-label="نمودار قیمت طلای آبشده">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradId})`} />
          <path d={path} fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinejoin="round" />
        </svg>
        {compact ? null : (
          <>
            <span className="pointer-events-none absolute left-2 top-2 text-[10px] tabular-nums text-slate-400">
              {maxLabel}
            </span>
            <span className="pointer-events-none absolute bottom-2 left-2 text-[10px] tabular-nums text-slate-400">
              {minLabel}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function buildPath(series: number[]): { path: string; area: string; min: number; max: number } {
  if (!series.length) {
    return { path: '', area: '', min: 0, max: 0 };
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const w = 400;
  const h = 140;
  const pad = 8;
  const coords = series.map((value, index) => {
    const x = (index / Math.max(series.length - 1, 1)) * w;
    const y = pad + (1 - (value - min) / span) * (h - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const last = coords[coords.length - 1];
  const first = coords[0];
  const area = `${path} L${last[0].toFixed(2)},${h} L${first[0].toFixed(2)},${h} Z`;
  return { path, area, min, max };
}
