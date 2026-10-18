import { BarChart3 } from 'lucide-react';
import type { ActivitySeriesPoint } from '@/lib/api';
import { isZeroDecimal } from '@/lib/decimal-string';
import {
  WEIGHT_HISTORY_BUCKETS,
  netBookedGrams,
  seriesPointLabel,
  type WeightHistoryBucket,
} from '@/lib/asset-chart-range';
import { formatWeight } from '@/lib/utils';
import { moneyTone, toneClass } from '@/lib/portfolio-display';
import { AssetSkeleton, CardHeading, EmptyNote, RangeChip, assetCardClass } from './assets-ui';

export function GoldBalanceHistory({
  points,
  bucket,
  onBucketChange,
  loading,
  error,
  onRetry,
}: {
  points: ActivitySeriesPoint[];
  bucket: WeightHistoryBucket;
  onBucketChange: (bucket: WeightHistoryBucket) => void;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const bars = points
    .map((point) => ({ point, net: netBookedGrams(point) }))
    .filter((bar): bar is { point: ActivitySeriesPoint; net: string } => bar.net != null && !isZeroDecimal(bar.net));
  const hasUnclassified = points.some((point) => !isZeroDecimal(point.unclassifiedGrams));
  const max = bars.reduce((peak, bar) => Math.max(peak, Math.abs(Number(bar.net)) || 0), 0);
  const bucketLabel = WEIGHT_HISTORY_BUCKETS.find((item) => item.id === bucket)?.label ?? '';

  return (
    <section aria-labelledby="weight-history-title" className={assetCardClass}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardHeading id="weight-history-title" title="تغییرات وزن دارایی" icon={BarChart3} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="بازه تغییرات وزن دارایی">
          {WEIGHT_HISTORY_BUCKETS.map((item) => (
            <RangeChip key={item.id} active={item.id === bucket} onClick={() => onBucketChange(item.id)}>
              {item.label}
            </RangeChip>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#6B7280]">
        خالص گرم ثبت‌شده به‌صورت {bucketLabel}، خرید منهای فروش.
      </p>
      {loading ? (
        <AssetSkeleton className="mt-3 h-28 w-full" />
      ) : error ? (
        <div className="mt-3">
          <EmptyNote>تغییرات وزن در حال حاضر قابل دریافت نیست.</EmptyNote>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : bars.length === 0 ? (
        <div className="mt-4">
          <EmptyNote>در این بازه تغییر وزنی ثبت نشده است.</EmptyNote>
        </div>
      ) : (
        <ul className="mt-3 flex items-stretch gap-2 overflow-x-auto pb-1">
          {bars.map((bar) => {
            const height = max > 0 ? Math.max(8, (Math.abs(Number(bar.net)) / max) * 40) : 8;
            const tone = moneyTone(bar.net);
            const negative = tone === 'negative';
            return (
              <li key={bar.point.key} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <span className={`max-w-full text-center text-[11px] font-semibold leading-4 tabular-nums ${toneClass(tone)}`}>
                  {formatWeight(bar.net)}
                </span>
                <span className="flex h-[88px] w-7 flex-col" aria-hidden>
                  <span className="flex flex-1 items-end justify-center">
                    {!negative ? <span className="w-full rounded-t-md bg-[#C8922E]" style={{ height }} /> : null}
                  </span>
                  <span className="h-px w-full bg-[#E5E7EB]" />
                  <span className="flex flex-1 items-start justify-center">
                    {negative ? <span className="w-full rounded-b-md bg-[#DC2626]" style={{ height }} /> : null}
                  </span>
                </span>
                <span className="text-center text-[11px] leading-4 text-[#6B7280]">{seriesPointLabel(bar.point.key)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {hasUnclassified ? (
        <p className="mt-2 text-[11px] leading-5 text-[#6B7280]">سفارش‌های بدون نوع خرید یا فروش در این نمودار نیست.</p>
      ) : null}
    </section>
  );
}
