'use client';

import { useId, useMemo, useState, type PointerEvent } from 'react';
import { formatRial } from '@/lib/utils';
import type { PortfolioHistorySeries, PortfolioPeriod } from '@/lib/portfolio-history-preview';
import { summarizePreviewRial } from '@/lib/portfolio-history-preview';
import { PeriodPills, PreviewNote, assetCardClass } from './assets-ui';

export function PortfolioValueChart({
  series,
  period,
  onPeriodChange,
}: {
  series: PortfolioHistorySeries;
  period: PortfolioPeriod;
  onPeriodChange: (period: PortfolioPeriod) => void;
}) {
  const gradId = useId().replace(/:/g, '');
  const summary = useMemo(() => summarizePreviewRial(series.points), [series.points]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    series.points.find((point) => point.id === selectedId) ?? series.points[series.points.length - 1];
  const selectedIndex = selected ? series.points.findIndex((point) => point.id === selected.id) : -1;
  const geometry = useMemo(() => buildLine(series.points.map((point) => Number(point.valueRial))), [series.points]);

  const summaryText = summary
    ? `آخرین ارزش ${formatRial(summary.last)}، کمینه ${formatRial(summary.min)}، بیشینه ${formatRial(summary.max)}`
    : 'نمودار ارزش دارایی بدون داده';

  return (
    <section aria-labelledby="portfolio-chart-title" className={assetCardClass}>
      <h2 id="portfolio-chart-title" className="text-base font-bold text-[#202124]">
        نمودار ارزش دارایی
      </h2>
      <div className="mt-3">
        <PreviewNote />
      </div>
      <div className="mt-3">
        <PeriodPills period={period} onChange={onPeriodChange} labelKind="chartLabel" label="بازه نمودار ارزش" />
      </div>

      <p className="sr-only">{summaryText}</p>

      <div className="relative mt-4 h-44 w-full overflow-hidden rounded-xl bg-[#FFF4D6]/40">
        <svg
          viewBox="0 0 400 160"
          className="h-full w-full touch-none"
          role="img"
          aria-label={summaryText}
          onPointerDown={(event) => {
            const next = nearestPoint(event, series.points.length);
            const point = series.points[next];
            if (point) setSelectedId(point.id);
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C8922E" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#C8922E" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={geometry.area} fill={`url(#${gradId})`} />
          <path d={geometry.path} fill="none" stroke="#C8922E" strokeWidth="2.4" strokeLinejoin="round" />
          {selectedIndex >= 0 ? (
            <circle
              cx={geometry.coords[selectedIndex]?.[0] ?? 0}
              cy={geometry.coords[selectedIndex]?.[1] ?? 0}
              r="4"
              fill="#C8922E"
            />
          ) : null}
        </svg>
      </div>

      {selected ? (
        <p className="mt-3 text-sm text-[#202124]" dir="rtl">
          <span className="text-[#6B7280]">{selected.label}</span>
          <span className="mx-1 text-[#E5E7EB]">·</span>
          <span className="font-semibold tabular-nums">{formatRial(selected.valueRial)}</span>
        </p>
      ) : null}

      {summary ? (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="آخرین" value={formatRial(summary.last)} />
          <Stat label="کمینه" value={formatRial(summary.min)} />
          <Stat label="بیشینه" value={formatRial(summary.max)} />
        </dl>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#F8F9FA] px-1 py-2">
      <dt className="text-[10px] text-[#6B7280]">{label}</dt>
      <dd className="mt-1 truncate text-[11px] font-semibold tabular-nums text-[#202124] sm:text-xs">{value}</dd>
    </div>
  );
}

function nearestPoint(event: PointerEvent<SVGSVGElement>, count: number): number {
  if (count <= 1) return 0;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Math.round(ratio * (count - 1));
}

function buildLine(series: number[]): { path: string; area: string; coords: Array<readonly [number, number]> } {
  if (!series.length) return { path: '', area: '', coords: [] };
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const width = 400;
  const height = 160;
  const pad = 12;
  const coords = series.map((value, index) => {
    const x = (index / Math.max(series.length - 1, 1)) * width;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = coords[coords.length - 1] ?? [0, height];
  const first = coords[0] ?? [0, height];
  const area = `${path} L${last[0].toFixed(1)},${height} L${first[0].toFixed(1)},${height} Z`;
  return { path, area, coords };
}
