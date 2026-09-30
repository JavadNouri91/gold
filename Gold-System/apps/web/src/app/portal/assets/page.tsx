'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { pricingApi, tradesApi } from '@/lib/api';
import { loadCustomerPosition } from '@/lib/customer-portfolio';
import { previewPortfolioHistory, type PortfolioPeriod } from '@/lib/portfolio-history-preview';
import { AssetsPage } from '@/components/portal/assets/assets-page';

export default function PortalAssetsRoute() {
  const position = loadCustomerPosition();
  const [chartPeriod, setChartPeriod] = useState<PortfolioPeriod>('1m');
  const [performancePeriod, setPerformancePeriod] = useState<PortfolioPeriod>('1m');
  const chartSeries = useMemo(() => previewPortfolioHistory(chartPeriod), [chartPeriod]);
  const performanceSeries = useMemo(() => previewPortfolioHistory(performancePeriod), [performancePeriod]);

  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());
  const trades = useSWR('assets/trades', () => tradesApi.list({ limit: 5 }));

  return (
    <AssetsPage
      position={position}
      price={price.data}
      priceLoading={price.isLoading}
      priceError={Boolean(price.error)}
      onRefreshPrice={() => {
        void price.mutate();
      }}
      chartSeries={chartSeries}
      chartPeriod={chartPeriod}
      onChartPeriod={setChartPeriod}
      performanceSeries={performanceSeries}
      performancePeriod={performancePeriod}
      onPerformancePeriod={setPerformancePeriod}
      trades={trades.data?.data ?? []}
      tradesLoading={trades.isLoading}
      tradesError={Boolean(trades.error)}
      onRetryTrades={() => {
        void trades.mutate();
      }}
    />
  );
}
