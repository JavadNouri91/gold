import type { ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, Scale, TrendingUp } from 'lucide-react';
import type { ActivitySegment, ActivitySeriesPoint, ActivitySummary } from '@/lib/api';
import { activityBucketLabel } from '@/lib/activity-bucket-label';
import { formatMoney, formatWeight, toPersianDigits } from '@/lib/utils';
import { formatSignedPercent, formatSignedRial, moneyTone, toneClass } from '@/lib/portfolio-display';

const cardClass = 'min-w-0 rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm';

function weightLabel(grams: string, unit: string): string {
  return unit === 'GRAM' ? formatWeight(grams) : toPersianDigits(grams);
}

export function ActivitySummaryCards({ summary }: { summary: ActivitySummary }) {
  const pnl = summary.pnl;
  const tone = moneyTone(pnl.totalRial);
  return (
    <section aria-label="خلاصه معاملات" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <article className={cardClass}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-[#6B7280] sm:text-sm">سود / زیان کل</p>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FA] text-[#6B7280]" aria-hidden>
            <TrendingUp className="h-4 w-4" />
          </span>
        </div>
        {pnl.supported && pnl.totalRial ? (
          <p className={`mt-3 text-sm font-bold tabular-nums sm:text-lg ${toneClass(tone)}`}>
            {formatSignedRial(pnl.totalRial)}
            {pnl.changePercent ? (
              <span className="mt-1 block text-xs">{formatSignedPercent(pnl.changePercent, tone)}</span>
            ) : null}
          </p>
        ) : (
          <p className="mt-3 text-lg font-bold text-[#6B7280]">—</p>
        )}
        <p className="mt-1 text-[11px] leading-5 text-[#6B7280] sm:text-xs">
          {pnl.supported ? 'از محاسبه سامانه' : 'سود و زیان مشتری ثبت نشده'}
        </p>
        {pnl.supported && (pnl.realizedRial || pnl.unrealizedRial) ? (
          <dl className="mt-2 space-y-1 text-[11px] text-[#6B7280]">
            {pnl.realizedRial ? (
              <div className="flex justify-between gap-2">
                <dt>سود تحقق‌یافته</dt>
                <dd className="tabular-nums">{formatSignedRial(pnl.realizedRial)}</dd>
              </div>
            ) : null}
            {pnl.unrealizedRial ? (
              <div className="flex justify-between gap-2">
                <dt>سود تحقق‌نیافته</dt>
                <dd className="tabular-nums">{formatSignedRial(pnl.unrealizedRial)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </article>

      <SummaryMoneyCard
        label="حجم معاملات"
        icon={<Scale className="h-4 w-4" />}
        iconClass="bg-[#FFF4D6] text-[#C8922E]"
        value={weightLabel(summary.volume.grams, summary.volume.unit)}
        hint={`در ${toPersianDigits(String(summary.volume.count))} معامله`}
      />
      <SummaryMoneyCard
        label="مجموع خرید"
        icon={<ArrowDownLeft className="h-4 w-4" />}
        iconClass="bg-green-50 text-[#16A34A]"
        value={formatMoney(summary.buy.amountRial)}
        hint={weightLabel(summary.buy.grams, summary.volume.unit)}
        valueClass="text-[#16A34A]"
      />
      <SummaryMoneyCard
        label="مجموع فروش"
        icon={<ArrowUpRight className="h-4 w-4" />}
        iconClass="bg-red-50 text-[#DC2626]"
        value={formatMoney(summary.sell.amountRial)}
        hint={weightLabel(summary.sell.grams, summary.volume.unit)}
        valueClass="text-[#DC2626]"
      />
    </section>
  );
}

function SummaryMoneyCard({
  label,
  icon,
  iconClass,
  value,
  hint,
  valueClass = 'text-[#202124]',
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
        <p className="text-xs font-medium text-[#6B7280] sm:text-sm">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconClass}`} aria-hidden>
          {icon}
        </span>
      </div>
      <p className={`mt-3 break-words text-sm font-bold tabular-nums sm:text-lg ${valueClass}`}>{value}</p>
      <p className="mt-1 text-[11px] text-[#6B7280] sm:text-xs">{hint}</p>
    </article>
  );
}

const SEGMENT_STYLE: Record<ActivitySegment['id'], { color: string; label: string }> = {
  BUY: { color: '#16A34A', label: 'خرید' },
  SELL: { color: '#DC2626', label: 'فروش' },
  UNCLASSIFIED: { color: '#C8922E', label: 'بدون جهت' },
};

export function ActivityDistribution({ summary }: { summary: ActivitySummary }) {
  const segments = summary.distribution.segments;
  const unit = summary.distribution.unit;
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
    <section aria-labelledby="distribution-title" className={cardClass}>
      <h2 id="distribution-title" className="text-base font-bold text-[#202124]">
        توزیع نوع معاملات
      </h2>
      {segments.length === 0 ? (
        <p className="mt-4 text-sm leading-7 text-[#6B7280]">در این بازه حجمی برای نمایش توزیع نیست.</p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          <Donut segments={segments} center={weightLabel(summary.volume.grams, unit)} label={summaryText} />
          <ul className="w-full min-w-0 flex-1 space-y-3">
            {segments.map((segment) => {
              const style = SEGMENT_STYLE[segment.id];
              return (
                <li key={segment.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-[#202124]">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.color }} aria-hidden />
                    {style.label}
                  </span>
                  <span className="text-left">
                    <span className="font-semibold tabular-nums">{weightLabel(segment.grams, unit)}</span>
                    <span className="mr-2 text-xs text-[#6B7280]">({toPersianDigits(segment.share)}٪)</span>
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

function Donut({
  segments,
  center,
  label,
}: {
  segments: ActivitySegment[];
  center: string;
  label: string;
}) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 112 112" className="h-full w-full" role="img" aria-label={label}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="12" />
        {segments.map((segment) => {
          const share = Number(segment.share);
          const length = (Number.isFinite(share) ? share : 0) / 100 * circumference;
          const dash = `${length} ${circumference - length}`;
          const circle = (
            <circle
              key={segment.id}
              cx="56"
              cy="56"
              r={radius}
              fill="none"
              stroke={SEGMENT_STYLE[segment.id].color}
              strokeWidth="12"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform="rotate(-90 56 56)"
            />
          );
          offset += length;
          return circle;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-sm font-bold tabular-nums text-[#202124]">{center}</span>
        <span className="px-6 text-[10px] leading-4 text-[#6B7280]">حجم کل معاملات</span>
      </div>
    </div>
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
  bucket: 'week' | 'month' | 'quarter' | 'year';
  onBucket: (bucket: 'week' | 'month' | 'quarter' | 'year') => void;
}) {
  const max = series.reduce((peak, point) => {
    return Math.max(peak, Number(point.buyGrams) || 0, Number(point.sellGrams) || 0, Number(point.unclassifiedGrams) || 0);
  }, 0);
  const showUnclassified = series.some((point) => (Number(point.unclassifiedGrams) || 0) > 0);
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
    <section aria-labelledby="volume-chart-title" className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="volume-chart-title" className="text-base font-bold text-[#202124]">
          نمودار حجم معاملات
        </h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="بازه نمودار">
          {(
            [
              ['week', 'هفتگی'],
              ['month', 'ماهانه'],
              ['quarter', 'فصلی'],
              ['year', 'سالانه'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={bucket === id}
              onClick={() => onBucket(id)}
              className={`min-h-11 rounded-full px-3 text-xs font-medium ${
                bucket === id ? 'bg-[#C8922E] text-white' : 'bg-[#F8F9FA] text-[#202124]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="sr-only">{summaryText}</p>
      {series.length === 0 || max <= 0 ? (
        <p className="mt-4 text-sm leading-7 text-[#6B7280]">در این بازه حجم معامله‌ای برای نمودار نیست.</p>
      ) : (
        <>
          <div className="mt-4 flex h-44 items-end gap-1 overflow-hidden" aria-hidden>
            {series.map((point) => (
              <div key={point.key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
                <Bar value={point.buyGrams} max={max} color="#16A34A" />
                <Bar value={point.sellGrams} max={max} color="#DC2626" />
                {showUnclassified ? <Bar value={point.unclassifiedGrams} max={max} color="#C8922E" /> : null}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-1">
            {series.map((point, index) => {
              const hide = series.length > 8 && index % Math.ceil(series.length / 6) !== 0;
              return (
                <span
                  key={point.key}
                  className={`min-w-0 flex-1 truncate text-center text-[10px] text-[#6B7280] ${hide ? 'invisible sm:visible' : ''}`}
                >
                  {activityBucketLabel(point.key)}
                </span>
              );
            })}
          </div>
          <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[#6B7280]">
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#16A34A]" aria-hidden /> خرید
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#DC2626]" aria-hidden /> فروش
            </li>
            {showUnclassified ? (
              <li className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#C8922E]" aria-hidden /> بدون جهت
              </li>
            ) : null}
          </ul>
        </>
      )}
    </section>
  );
}

function Bar({ value, max, color }: { value: string; max: number; color: string }) {
  const amount = Number(value);
  const height = !Number.isFinite(amount) || amount <= 0 || max <= 0 ? 0 : Math.max(4, (amount / max) * 100);
  return (
    <span className="flex h-full w-2 max-w-[14px] flex-1 items-end sm:w-3">
      <span className="block w-full rounded-t-md" style={{ height: `${height}%`, backgroundColor: color }} />
    </span>
  );
}
