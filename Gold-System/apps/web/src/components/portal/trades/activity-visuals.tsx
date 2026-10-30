'use client';

import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Scale, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ActivityBucket, ActivitySegment, ActivitySeriesPoint, ActivitySummary } from '@/lib/api';
import { activityBucketLabel } from '@/lib/activity-bucket-label';
import { formatCompactToman, formatMoney, formatWeight, toPersianDigits } from '@/lib/utils';
import { moneyTone, toneClass } from '@/lib/portfolio-display';

const cardClass = 'min-w-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm';

function weightLabel(grams: string, unit: string): string {
  return unit === 'GRAM' ? formatWeight(grams) : toPersianDigits(grams);
}

export function ActivitySummaryCards({ summary }: { summary: ActivitySummary }) {
  const pnl = summary.pnl;
  const hasPnl = Boolean(pnl.supported && pnl.totalRial);
  const tone = hasPnl ? moneyTone(pnl.totalRial) : 'positive';
  const simulatedAmount = '1540000000';
  const pnlAmount = hasPnl ? formatCompactToman(pnl.totalRial) : formatMoney(simulatedAmount);
  const pnlPercent = hasPnl
    ? signedPercentLabel(pnl.changePercent, tone)
    : signedPercentLabel('12.4', 'positive');

  return (
    <section aria-label="خلاصه معاملات" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <SummaryMoneyCard
        label="حجم کل معاملات"
        icon={<Scale className="h-4 w-4" />}
        iconClass="bg-amber-50 text-amber-600"
        value={weightLabel(summary.volume.grams, summary.volume.unit)}
        hint={`در ${toPersianDigits(String(summary.volume.count))} سفارش`}
      />
      <SummaryMoneyCard
        label="مجموع خرید"
        icon={<ArrowUpRight className="h-4 w-4" />}
        iconClass="bg-emerald-50 text-emerald-600"
        value={formatCompactToman(summary.buy.amountRial)}
        hint={weightLabel(summary.buy.grams, summary.volume.unit)}
        valueClass="text-emerald-600"
      />
      <SummaryMoneyCard
        label="مجموع فروش"
        icon={<ArrowDownRight className="h-4 w-4" />}
        iconClass="bg-rose-50 text-rose-600"
        value={formatCompactToman(summary.sell.amountRial)}
        hint={weightLabel(summary.sell.grams, summary.volume.unit)}
        valueClass="text-rose-600"
      />
      <article className={cardClass}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">سود و زیان کل</p>
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              tone === 'negative' ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
            }`}
            aria-hidden
          >
            <TrendingUp className="h-4 w-4" />
          </span>
        </div>
        <p className={`mt-3 text-sm font-bold tabular-nums sm:text-lg ${toneClass(tone)}`}>
          {pnlPercent}
          {pnlAmount ? <span className="mr-1 text-xs font-semibold">({pnlAmount})</span> : null}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">
          {hasPnl ? 'از محاسبه سامانه' : 'نمایش نمونه وضعیت مثبت'}
        </p>
      </article>
    </section>
  );
}

function SummaryMoneyCard({
  label,
  icon,
  iconClass,
  value,
  hint,
  valueClass = 'text-slate-900',
}: {
  label: string;
  icon: ReactNode;
  iconClass: string;
  value: string;
  hint: string;
  valueClass?: string;
}) {
  return (
    <article className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`} aria-hidden>
          {icon}
        </span>
      </div>
      <p className={`mt-3 break-words text-sm font-bold tabular-nums sm:text-lg ${valueClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-slate-500 sm:text-xs">{hint}</p>
    </article>
  );
}

const SEGMENT_STYLE: Record<ActivitySegment['id'], { color: string; label: string }> = {
  BUY: { color: '#10B981', label: 'خرید' },
  SELL: { color: '#F43F5E', label: 'فروش' },
  UNCLASSIFIED: { color: '#F59E0B', label: 'سایر' },
};

export function ActivityDistribution({ summary }: { summary: ActivitySummary }) {
  const segments = summary.distribution.segments;
  const unit = summary.distribution.unit;
  const chartData = segments.map((segment) => ({
    id: segment.id,
    name: SEGMENT_STYLE[segment.id].label,
    value: Number(segment.share) || 0,
    grams: segment.grams,
    color: SEGMENT_STYLE[segment.id].color,
  }));
  const summaryText =
    segments.length === 0
      ? 'توزیع نوع معاملات در این بازه خالی است'
      : segments
          .map((segment) => {
            const style = SEGMENT_STYLE[segment.id];
            return `${style.label} ${weightLabel(segment.grams, unit)} ${toPersianDigits(segment.share)} درصد`;
          })
          .join('، ');

  return (
    <section aria-labelledby="distribution-title" className={`${cardClass} h-full`}>
      <h2 id="distribution-title" className="text-base font-bold text-slate-900">
        توزیع نوع معاملات
      </h2>
      {segments.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-slate-500">در این بازه حجمی برای نمایش توزیع نیست.</p>
      ) : (
        <div className="mt-2 flex h-72 min-h-0 flex-col items-center gap-3 sm:flex-row">
          <div className="relative h-56 w-full max-w-[220px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">
                  {chartData.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-sm font-bold tabular-nums text-slate-900">
                {weightLabel(summary.volume.grams, unit)}
              </span>
              <span className="px-8 text-[10px] leading-4 text-slate-500">حجم کل</span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-3">
            {segments.map((segment) => {
              const style = SEGMENT_STYLE[segment.id];
              return (
                <li key={segment.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-slate-800">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
                    {style.label}
                  </span>
                  <span className="text-left">
                    <span className="font-semibold tabular-nums text-slate-900">{toPersianDigits(segment.share)}٪</span>
                    <span className="mr-2 text-xs text-slate-500">{weightLabel(segment.grams, unit)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="sr-only">{summaryText}</p>
    </section>
  );
}

export function ActivityVolumeChart({
  series,
  unit,
  bucket,
  onBucket,
}: {
  series: ActivitySeriesPoint[];
  unit: string;
  bucket: ActivityBucket;
  onBucket: (bucket: ActivityBucket) => void;
}) {
  const showUnclassified = series.some((point) => (Number(point.unclassifiedGrams) || 0) > 0);
  const rows = series.map((point) => ({
    key: point.key,
    label: shortBucketLabel(point.key),
    buy: Number(point.buyGrams) || 0,
    sell: Number(point.sellGrams) || 0,
    other: Number(point.unclassifiedGrams) || 0,
  }));
  const max = rows.reduce((peak, point) => Math.max(peak, point.buy, point.sell, point.other), 0);
  const summaryText =
    series.length === 0
      ? 'نمودار حجم معاملات در این بازه خالی است'
      : series
          .map(
            (point) =>
              `${activityBucketLabel(point.key)} خرید ${weightLabel(point.buyGrams, unit)} فروش ${weightLabel(point.sellGrams, unit)}`,
          )
          .join('؛ ');

  return (
    <section aria-labelledby="volume-chart-title" className={`${cardClass} h-full`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="volume-chart-title" className="text-base font-bold text-slate-900">
          روند حجم معاملات
        </h2>
        <div className="flex flex-wrap gap-1 rounded-full bg-slate-50 p-1" role="group" aria-label="بازه نمودار">
          {(
            [
              ['week', 'هفتگی'],
              ['month', 'ماهانه'],
              ['quarter', 'فصلی'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={bucket === id}
              onClick={() => onBucket(id)}
              className={`min-h-9 rounded-full px-3 text-xs font-medium ${
                bucket === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only">{summaryText}</p>
      {series.length === 0 || max <= 0 ? (
        <p className="mt-4 text-sm leading-7 text-slate-500">در این بازه حجم معامله‌ای برای نمودار نیست.</p>
      ) : (
        <div className="mt-2 h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={4} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="#F1F5F9" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: '#64748B', fontSize: 11 }}
              />
              <YAxis
                hide
                orientation="right"
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                content={({ payload, label }) => {
                  if (!payload?.length) return null;
                  return (
                    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs shadow-sm" dir="rtl">
                      <p className="mb-1 font-semibold text-slate-700">{String(label)}</p>
                      {payload.map((item) => (
                        <p key={String(item.dataKey)} className="tabular-nums text-slate-600">
                          {item.dataKey === 'buy' ? 'خرید' : item.dataKey === 'sell' ? 'فروش' : 'سایر'}{' '}
                          {formatWeight(String(item.value ?? 0))}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Bar dataKey="buy" name="خرید" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={28} />
              <Bar dataKey="sell" name="فروش" fill="#F43F5E" radius={[6, 6, 0, 0]} maxBarSize={28} />
              {showUnclassified ? (
                <Bar dataKey="other" name="سایر" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={28} />
              ) : null}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function shortBucketLabel(key: string): string {
  const full = activityBucketLabel(key);
  return full.split(' ')[0] ?? full;
}

function signedPercentLabel(value: string | null | undefined, tone: 'positive' | 'negative' | 'neutral'): string {
  if (value == null || value.trim() === '') return '';
  const body = toPersianDigits(value.trim().replace(/^-/, ''));
  const prefix = tone === 'negative' ? '−' : tone === 'positive' ? '+' : '';
  return `${prefix}${body}٪`;
}
