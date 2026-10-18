'use client';

import { useId, useMemo, useState } from 'react';
import { LineChart } from 'lucide-react';
import type { ActivitySeriesPoint } from '@/lib/api';
import {
  ASSET_CHART_RANGES,
  ownedGoldGrams,
  portfolioValueSeries,
  type AssetChartRange,
  type PortfolioValuePoint,
} from '@/lib/asset-chart-range';
import { isZeroDecimal, ratioPercent, subtractDecimal } from '@/lib/decimal-string';
import { formatSignedPercent, moneyTone, toneClass } from '@/lib/portfolio-display';
import { cn, formatWholeMoney } from '@/lib/utils';
import { AssetSkeleton, CardHeading, EmptyNote, RangeChip, assetCardClass } from './assets-ui';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 188;
const CHART_PAD = { top: 12, right: 8, bottom: 30, left: 8 };

export function PortfolioValueChart({
  range,
  onRangeChange,
  points,
  livePriceRial,
  weightGrams,
  reservedPickupGrams,
  availableRial,
  loading,
  error,
  onRetry,
}: {
  range: AssetChartRange;
  onRangeChange: (range: AssetChartRange) => void;
  points?: ActivitySeriesPoint[];
  livePriceRial?: string | null;
  weightGrams?: string | null;
  reservedPickupGrams?: string | null;
  availableRial?: string | null;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const label = ASSET_CHART_RANGES.find((item) => item.id === range)?.label ?? '';
  const series = portfolioValueSeries(
    points ?? [],
    livePriceRial,
    ownedGoldGrams(weightGrams, reservedPickupGrams),
    availableRial,
  );
  const last = series[series.length - 1];
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const active = series.find((point) => point.key === hoverKey) ?? last;
  const compared = rangeChange(series[0], active);

  return (
    <section aria-labelledby="portfolio-chart-title" className={assetCardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardHeading id="portfolio-chart-title" title="نمودار ارزش دارایی" icon={LineChart} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="بازه نمودار ارزش دارایی">
          {ASSET_CHART_RANGES.map((item) => (
            <RangeChip key={item.id} active={item.id === range} onClick={() => onRangeChange(item.id)}>
              {item.label}
            </RangeChip>
          ))}
        </div>
      </div>
      {loading ? (
        <AssetSkeleton className="mt-4 h-44 w-full" />
      ) : error ? (
        <div className="mt-4">
          <EmptyNote>نمودار ارزش در حال حاضر قابل دریافت نیست.</EmptyNote>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : series.length === 0 || !last || !active ? (
        <div className="mt-4 flex min-h-36 items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F9FA] px-4 py-6 text-center">
          <EmptyNote>در بازه {label} ارزش دارایی برای نمایش نمودار ثبت نشده است.</EmptyNote>
        </div>
      ) : (
        <div className="mt-3">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xl font-bold tabular-nums tracking-tight text-[#202124] sm:text-2xl">
            {formatWholeMoney(active.valueRial)}
            {compared ? (
              <span className={cn('text-sm font-semibold', toneClass(compared.tone))}>
                {formatSignedPercent(compared.percent, compared.tone)}
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">
            {hoverKey ? active.label : `موجودی طلا با قیمت لحظه‌ای، به‌اضافه توان خرید فعلی. در بازه ${label}.`}
          </p>
          <ValueLine series={series} activeKey={hoverKey} onActiveKeyChange={setHoverKey} />
        </div>
      )}
    </section>
  );
}

function rangeChange(start: PortfolioValuePoint | undefined, current: PortfolioValuePoint | undefined) {
  if (!start || !current || isZeroDecimal(start.valueRial)) return null;
  let delta: string;
  try {
    delta = subtractDecimal(current.valueRial, start.valueRial);
  } catch {
    return null;
  }
  if (isZeroDecimal(delta)) return null;
  const percent = ratioPercent(delta, start.valueRial);
  if (percent == null) return null;
  return { percent, tone: moneyTone(delta) };
}

function ValueLine({
  series,
  activeKey,
  onActiveKeyChange,
}: {
  series: PortfolioValuePoint[];
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
}) {
  const gradientId = useId().replace(/:/g, '');
  const coords = useMemo(() => chartCoords(series), [series]);
  const active = coords.find((point) => point.key === activeKey) ?? null;
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const area = `${line} L ${coords[coords.length - 1]!.x} ${CHART_PAD.top + innerHeight()} L ${coords[0]!.x} ${CHART_PAD.top + innerHeight()} Z`;
  const summary = coords.map((point) => `${point.label} ${formatWholeMoney(point.valueRial)}`).join('، ');
  const labelEvery = Math.max(1, Math.ceil(coords.length / 6));
  const tooltipLeft = active ? Math.min(92, Math.max(8, (active.x / CHART_WIDTH) * 100)) : 0;

  function setFromClientX(svg: SVGSVGElement, clientX: number) {
    const bounds = svg.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const x = ((clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    onActiveKeyChange(nearestPoint(coords, x).key);
  }

  return (
    <div className="relative mt-2" dir="ltr">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        className="h-44 w-full touch-pan-y"
        role="img"
        aria-label={`نمودار ارزش دارایی. آخرین ارزش ${formatWholeMoney(coords[coords.length - 1]!.valueRial)}. ${summary}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setFromClientX(event.currentTarget, event.clientX);
        }}
        onPointerMove={(event) => {
          setFromClientX(event.currentTarget, event.clientX);
        }}
        onPointerLeave={() => onActiveKeyChange(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C8922E" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#C8922E" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="#C8922E" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {active ? (
          <line
            x1={active.x}
            x2={active.x}
            y1={CHART_PAD.top}
            y2={CHART_PAD.top + innerHeight()}
            stroke="#C8922E"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.7"
          />
        ) : null}
        {coords.map((point) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            r={active?.key === point.key ? 6 : coords.length > 24 ? 2.5 : 4}
            fill="#C8922E"
            stroke={active?.key === point.key ? '#FFFFFF' : undefined}
            strokeWidth={active?.key === point.key ? 2 : undefined}
          />
        ))}
        {coords.map((point, index) =>
          index === 0 || index === coords.length - 1 || index % labelEvery === 0 ? (
            <text
              key={`${point.key}-label`}
              x={point.x}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              className="fill-[#6B7280]"
              fontSize="11"
            >
              {point.label}
            </text>
          ) : null,
        )}
        <rect x="0" y="0" width={CHART_WIDTH} height={CHART_HEIGHT} fill="transparent" />
      </svg>
      {active ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-3 rounded-xl bg-[#202124] px-3 py-2 text-center shadow-lg"
          style={{ left: `${tooltipLeft}%`, top: `${(active.y / CHART_HEIGHT) * 100}%` }}
          role="status"
        >
          <p className="text-[11px] text-white/80">{active.label}</p>
          <p className="text-sm font-bold tabular-nums text-white">{formatWholeMoney(active.valueRial)}</p>
        </div>
      ) : null}
    </div>
  );
}

function innerWidth() {
  return CHART_WIDTH - CHART_PAD.left - CHART_PAD.right;
}

function innerHeight() {
  return CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
}

function chartCoords(series: PortfolioValuePoint[]) {
  const values = series.map((point) => Math.max(0, Number(point.valueRial) || 0));
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  const span = max - min || max || 1;
  return series.map((point, index) => {
    const x =
      CHART_PAD.left + (series.length === 1 ? innerWidth() / 2 : (index / (series.length - 1)) * innerWidth());
    const y = CHART_PAD.top + (1 - (values[index]! - min) / span) * innerHeight();
    return { ...point, x, y };
  });
}

function nearestPoint(coords: Array<{ key: string; x: number }>, x: number) {
  return coords.reduce((best, point) => (Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best));
}
