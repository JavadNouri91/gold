'use client';

import { useMemo, useState } from 'react';
import { LineChart as LineChartIcon } from 'lucide-react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActivitySeriesPoint } from '@/lib/api';
import {
  ASSET_CHART_RANGES,
  ownedGoldGrams,
  portfolioValueSeries,
  type AssetChartRange,
  type PortfolioValuePoint,
} from '@/lib/asset-chart-range';
import { isZeroDecimal, ratioPercent, subtractDecimal } from '@/lib/decimal-string';
import { moneyTone, toneClass } from '@/lib/portfolio-display';
import { cn, formatWeight, formatWholeMoney, toPersianDigits } from '@/lib/utils';
import { AssetSkeleton, CardHeading, EmptyNote, RangeChip } from './assets-ui';

const VALUE_COLOR = '#D97706';
const WEIGHT_COLOR = '#2563EB';

type TrendRow = {
  key: string;
  tick: string;
  tooltipLabel: string;
  valueRial: string;
  grams: string;
  value: number;
  weight: number;
};

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
  const compared = rangeChange(series[0], last);
  const rows = useMemo(() => toTrendRows(series), [series]);
  const [hidden, setHidden] = useState({ value: false, weight: false });

  return (
    <section
      aria-labelledby="portfolio-chart-title"
      dir="rtl"
      className="flex h-full min-w-0 flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardHeading id="portfolio-chart-title" title="نمودار ارزش و وزن دارایی" icon={LineChartIcon} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="بازه نمودار ارزش و وزن دارایی">
          {ASSET_CHART_RANGES.map((item) => (
            <RangeChip key={item.id} active={item.id === range} onClick={() => onRangeChange(item.id)}>
              {item.label}
            </RangeChip>
          ))}
        </div>
      </div>
      {loading ? (
        <AssetSkeleton className="mt-4 min-h-44 w-full flex-1" />
      ) : error ? (
        <div className="mt-4 flex flex-1 flex-col justify-center">
          <EmptyNote>نمودار ارزش و وزن در حال حاضر قابل دریافت نیست.</EmptyNote>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : series.length === 0 || !last ? (
        <div className="mt-4 flex min-h-36 flex-1 items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F9FA] px-4 py-6 text-center">
          <EmptyNote>در بازه {label} ارزش دارایی برای نمایش نمودار ثبت نشده است.</EmptyNote>
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-bold tabular-nums tracking-tight text-[#202124] sm:text-2xl">
              {formatWholeMoney(last.valueRial)}
            </span>
            {compared ? (
              <span
                dir="ltr"
                className={cn('text-sm font-semibold tabular-nums', toneClass(compared.tone))}
              >
                {formatGrowth(compared.percent, compared.tone)}
              </span>
            ) : null}
            <span className="text-base font-bold tabular-nums text-[#2563EB] sm:text-lg">
              {formatWeight(last.grams)}
            </span>
          </p>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">
            دو خط روند در بازه {label}: ارزش ریالی موجودی با قیمت لحظه‌ای به‌اضافه توان خرید، و وزن طلا.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <button
              type="button"
              aria-pressed={!hidden.value}
              onClick={() => setHidden((current) => ({ ...current, value: !current.value }))}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
                hidden.value ? 'text-[#9CA3AF]' : 'text-[#202124]',
              )}
            >
              <span className="h-0.5 w-4 rounded-full bg-[#D97706]" aria-hidden />
              ارزش (تومان)
            </button>
            <button
              type="button"
              aria-pressed={!hidden.weight}
              onClick={() => setHidden((current) => ({ ...current, weight: !current.weight }))}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2 py-1',
                hidden.weight ? 'text-[#9CA3AF]' : 'text-[#202124]',
              )}
            >
              <span className="h-0.5 w-4 rounded-full bg-[#2563EB]" aria-hidden />
              وزن (گرم)
            </button>
          </div>
          <div
            className="mt-3 min-h-[260px] w-full flex-1"
            role="img"
            aria-label={`نمودار ارزش و وزن دارایی. آخرین ارزش ${formatWholeMoney(last.valueRial)} و وزن ${formatWeight(last.grams)}.`}
          >
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid stroke="#F3F4F6" vertical={false} />
                <XAxis
                  dataKey="tick"
                  tick={{ fill: '#6B7280', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="weight"
                  orientation="left"
                  tick={{ fill: '#2563EB', fontSize: 11 }}
                  tickFormatter={formatAxisGrams}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="value"
                  orientation="right"
                  tick={{ fill: '#D97706', fontSize: 11 }}
                  tickFormatter={formatAxisToman}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  yAxisId="value"
                  type="monotone"
                  dataKey="value"
                  name="ارزش (تومان)"
                  stroke={VALUE_COLOR}
                  fill={VALUE_COLOR}
                  fillOpacity={hidden.value ? 0 : 0.12}
                  strokeWidth={2.5}
                  hide={hidden.value}
                  dot={{ r: 3, fill: VALUE_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: '#FFFFFF', strokeWidth: 2 }}
                />
                <Line
                  yAxisId="weight"
                  type="monotone"
                  dataKey="weight"
                  name="وزن (گرم)"
                  stroke={WEIGHT_COLOR}
                  strokeWidth={2.5}
                  hide={hidden.weight}
                  dot={{ r: 3, fill: WEIGHT_COLOR, strokeWidth: 0 }}
                  activeDot={{ r: 6, stroke: '#FFFFFF', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}

function toTrendRows(series: PortfolioValuePoint[]): TrendRow[] {
  return series.map((point) => ({
    key: point.key,
    tick: axisTick(point),
    tooltipLabel: point.label,
    valueRial: point.valueRial,
    grams: point.grams,
    value: Math.max(0, Number(point.valueRial) || 0),
    weight: Math.max(0, Number(point.grams) || 0),
  }));
}

function axisTick(point: PortfolioValuePoint): string {
  if (point.key.startsWith('open:')) return '';
  return point.label;
}

function formatGrowth(percent: string, tone: 'positive' | 'negative' | 'neutral'): string {
  const body = toPersianDigits(percent.replace(/^-/, ''));
  if (tone === 'negative') return `−${body}٪`;
  if (tone === 'positive') return `+${body}٪`;
  return `${body}٪`;
}

function formatAxisToman(rial: number): string {
  const toman = Math.trunc(rial / 10);
  if (Math.abs(toman) >= 1_000_000_000) {
    return `${toPersianDigits(String(Math.round(toman / 1_000_000_000)))}م.د`;
  }
  if (Math.abs(toman) >= 1_000_000) {
    return `${toPersianDigits(String(Math.round(toman / 1_000_000)))}م`;
  }
  if (Math.abs(toman) >= 1_000) {
    return `${toPersianDigits(String(Math.round(toman / 1_000)))}هزار`;
  }
  return toPersianDigits(String(toman));
}

function formatAxisGrams(grams: number): string {
  const rounded = Number.isInteger(grams) ? String(grams) : grams.toFixed(1).replace(/\.0$/, '');
  return toPersianDigits(rounded);
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: TrendRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div
      role="status"
      dir="rtl"
      className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-right shadow-lg"
    >
      <p className="text-xs text-[#6B7280]">{row.tooltipLabel}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[#D97706]">{formatWholeMoney(row.valueRial)}</p>
      <p className="text-sm font-bold tabular-nums text-[#2563EB]">{formatWeight(row.grams)}</p>
    </div>
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
