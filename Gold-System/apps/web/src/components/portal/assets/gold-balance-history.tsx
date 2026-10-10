import { BarChart3 } from 'lucide-react';
import type { ActivitySeriesPoint } from '@/lib/api';
import { isZeroDecimal } from '@/lib/decimal-string';
import { ASSET_CHART_RANGES, netBookedGrams, seriesPointLabel, type AssetChartRange } from '@/lib/asset-chart-range';
import { formatWeight } from '@/lib/utils';
import { moneyTone, toneClass } from '@/lib/portfolio-display';
import { AssetSkeleton, CardHeading, EmptyNote, assetCardClass } from './assets-ui';

export function GoldBalanceHistory({
  points,
  range,
  loading,
  error,
  onRetry,
}: {
  points: ActivitySeriesPoint[];
  range: AssetChartRange;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const bars = points
    .map((point) => ({ point, net: netBookedGrams(point) }))
    .filter((bar): bar is { point: ActivitySeriesPoint; net: string } => bar.net != null && !isZeroDecimal(bar.net));
  const hasUnclassified = points.some((point) => !isZeroDecimal(point.unclassifiedGrams));
  const max = bars.reduce((peak, bar) => Math.max(peak, Math.abs(Number(bar.net)) || 0), 0);

  return (
    <section aria-labelledby="weight-history-title" className={assetCardClass}>
      <CardHeading id="weight-history-title" title="تغییرات وزن دارایی" icon={BarChart3} />
      <p className="mt-2 text-xs leading-5 text-[#6B7280]">
        خالص گرم ثبت‌شده در بازه {ASSET_CHART_RANGES.find((item) => item.id === range)?.label}، خرید منهای فروش. این موجودی پایان دوره و قیمت بازار نیست.
      </p>
      {loading ? (
        <AssetSkeleton className="mt-4 h-36 w-full" />
      ) : error ? (
        <div className="mt-4">
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
        <div className="mt-6">
          <EmptyNote>در این بازه تغییر وزنی ثبت نشده است.</EmptyNote>
        </div>
      ) : (
        <ul className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
          {bars.map((bar) => {
            const height = max > 0 ? Math.max(12, (Math.abs(Number(bar.net)) / max) * 96) : 12;
            const tone = moneyTone(bar.net);
            return (
              <li key={bar.point.key} className="flex w-14 shrink-0 flex-col items-center gap-2">
                <span className={`max-w-full text-center text-[10px] font-semibold leading-4 tabular-nums ${toneClass(tone)}`}>
                  {formatWeight(bar.net)}
                </span>
                <span
                  className={`w-8 rounded-t-md ${tone === 'negative' ? 'bg-[#DC2626]' : 'bg-[#C8922E]'}`}
                  style={{ height }}
                  aria-hidden
                />
                <span className="text-center text-[10px] leading-4 text-[#6B7280]">{seriesPointLabel(bar.point.key)}</span>
              </li>
            );
          })}
        </ul>
      )}
      {hasUnclassified ? (
        <p className="mt-3 text-[11px] leading-5 text-[#6B7280]">سفارش‌های بدون نوع خرید یا فروش در این نمودار نیست.</p>
      ) : null}
    </section>
  );
}
