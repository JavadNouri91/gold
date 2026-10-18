import type { ActivitySeriesPoint, CurrentPrice } from '@/lib/api';
import type { AssetChartRange, WeightHistoryBucket } from '@/lib/asset-chart-range';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import { AssetComposition } from './asset-composition';
import { AssetTradeActions } from './asset-trade-actions';
import { GoldBalanceHistory } from './gold-balance-history';
import { PortfolioSummary } from './portfolio-summary';
import { PortfolioValueChart } from './portfolio-value-chart';

export function AssetsPage({
  position,
  holdingLoading,
  holdingError,
  onRetryHolding,
  price,
  priceLoading,
  priceError,
  onRefreshPrice,
  range,
  onRangeChange,
  weightBucket,
  onWeightBucketChange,
  weightPoints,
  historyLoading,
  historyError,
  onRetryHistory,
  valuePoints,
  valueLoading,
  valueError,
  onRetryValue,
  availableRial,
}: {
  position: PortfolioPosition | null;
  holdingLoading?: boolean;
  holdingError?: boolean;
  onRetryHolding?: () => void;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
  availableRial?: string | null;
  range: AssetChartRange;
  onRangeChange: (range: AssetChartRange) => void;
  weightBucket: WeightHistoryBucket;
  onWeightBucketChange: (bucket: WeightHistoryBucket) => void;
  weightPoints: ActivitySeriesPoint[];
  historyLoading?: boolean;
  historyError?: boolean;
  onRetryHistory?: () => void;
  valuePoints?: ActivitySeriesPoint[];
  valueLoading?: boolean;
  valueError?: boolean;
  onRetryValue?: () => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      {holdingError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
          <p className="text-sm text-[#202124]">اطلاعات دارایی در حال حاضر قابل دریافت نیست.</p>
          <button
            type="button"
            onClick={onRetryHolding}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-[#202124]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : null}

      <PortfolioSummary
        position={position}
        holdingLoading={holdingLoading}
        holdingError={holdingError}
        price={price}
        priceLoading={priceLoading}
        priceError={priceError}
        onRefreshPrice={onRefreshPrice}
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <PortfolioValueChart
            range={range}
            onRangeChange={onRangeChange}
            points={valuePoints}
            livePriceRial={price?.normalizedValue}
            weightGrams={position?.weightGrams}
            reservedPickupGrams={position?.reservedPickupGrams}
            availableRial={availableRial}
            loading={valueLoading}
            error={valueError}
            onRetry={onRetryValue}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <AssetComposition
            position={position}
            availableRial={availableRial}
            livePriceRial={price?.normalizedValue}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <GoldBalanceHistory
            points={weightPoints}
            bucket={weightBucket}
            onBucketChange={onWeightBucketChange}
            loading={historyLoading}
            error={historyError}
            onRetry={onRetryHistory}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <AssetTradeActions position={position} price={price} />
        </div>
      </div>
    </div>
  );
}
