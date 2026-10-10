import type { ActivitySeriesPoint, ActivityTransaction, CurrentPrice } from '@/lib/api';
import type { AssetChartRange } from '@/lib/asset-chart-range';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import { AssetComposition } from './asset-composition';
import { AssetQuickActions } from './asset-quick-actions';
import { GoldBalanceHistory } from './gold-balance-history';
import { PortfolioSummary } from './portfolio-summary';
import { PortfolioValueChart } from './portfolio-value-chart';
import { RecentGoldTransactions } from './recent-gold-transactions';

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
  weightPoints,
  historyLoading,
  historyError,
  onRetryHistory,
  transactions,
  transactionsLoading,
  transactionsError,
  onRetryTransactions,
}: {
  position: PortfolioPosition | null;
  holdingLoading?: boolean;
  holdingError?: boolean;
  onRetryHolding?: () => void;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
  range: AssetChartRange;
  onRangeChange: (range: AssetChartRange) => void;
  weightPoints: ActivitySeriesPoint[];
  historyLoading?: boolean;
  historyError?: boolean;
  onRetryHistory?: () => void;
  transactions: ActivityTransaction[];
  transactionsLoading?: boolean;
  transactionsError?: boolean;
  onRetryTransactions?: () => void;
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

      <PortfolioValueChart range={range} onRangeChange={onRangeChange} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AssetComposition position={position} />
        <GoldBalanceHistory
          points={weightPoints}
          range={range}
          loading={historyLoading}
          error={historyError}
          onRetry={onRetryHistory}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentGoldTransactions
          rows={transactions}
          loading={transactionsLoading}
          error={transactionsError}
          onRetry={onRetryTransactions}
        />
        <AssetQuickActions />
      </div>
    </div>
  );
}
