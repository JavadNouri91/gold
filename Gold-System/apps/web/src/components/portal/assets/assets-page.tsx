'use client';

import type { CurrentPrice } from '@/lib/api';
import type { PortfolioPosition } from '@/lib/customer-portfolio';
import type { PortfolioHistorySeries, PortfolioPeriod } from '@/lib/portfolio-history-preview';
import { AssetComposition } from './asset-composition';
import { AssetReports } from './asset-reports';
import { GoldBalanceCard } from './gold-balance-card';
import { GoldBalanceHistory } from './gold-balance-history';
import { PortfolioMetrics } from './portfolio-metrics';
import { PortfolioPerformance } from './portfolio-performance';
import { PortfolioValueCard } from './portfolio-value-card';
import { PortfolioValueChart } from './portfolio-value-chart';
import { RecentGoldTransactions, type AssetTradeRow } from './recent-gold-transactions';

export function AssetsPage({
  position,
  price,
  priceLoading,
  priceError,
  onRefreshPrice,
  chartSeries,
  chartPeriod,
  onChartPeriod,
  performanceSeries,
  performancePeriod,
  onPerformancePeriod,
  trades,
  tradesLoading,
  tradesError,
  onRetryTrades,
}: {
  position: PortfolioPosition | null;
  price?: CurrentPrice;
  priceLoading?: boolean;
  priceError?: boolean;
  onRefreshPrice?: () => void;
  chartSeries: PortfolioHistorySeries;
  chartPeriod: PortfolioPeriod;
  onChartPeriod: (period: PortfolioPeriod) => void;
  performanceSeries: PortfolioHistorySeries;
  performancePeriod: PortfolioPeriod;
  onPerformancePeriod: (period: PortfolioPeriod) => void;
  trades: AssetTradeRow[];
  tradesLoading?: boolean;
  tradesError?: boolean;
  onRetryTrades?: () => void;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      {priceError ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
          <p className="text-sm text-[#202124]">اطلاعات دارایی در حال حاضر قابل دریافت نیست.</p>
          <button
            type="button"
            onClick={onRefreshPrice}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-[#202124]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GoldBalanceCard
          position={position}
          price={price}
          priceLoading={priceLoading}
          priceError={priceError}
          onRefreshPrice={onRefreshPrice}
        />
        <PortfolioValueCard position={position} />
      </div>

      <PortfolioMetrics position={position} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <PortfolioValueChart series={chartSeries} period={chartPeriod} onPeriodChange={onChartPeriod} />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <AssetComposition position={position} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PortfolioPerformance
          series={performanceSeries}
          period={performancePeriod}
          onPeriodChange={onPerformancePeriod}
        />
        <GoldBalanceHistory series={chartSeries} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <RecentGoldTransactions
            trades={trades}
            loading={tradesLoading}
            error={tradesError}
            onRetry={onRetryTrades}
          />
        </div>
        <div className="min-w-0 lg:col-span-2">
          <AssetReports />
        </div>
      </div>
    </div>
  );
}
