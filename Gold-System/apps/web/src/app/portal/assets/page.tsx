'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ordersApi, pricingApi } from '@/lib/api';
import { assetChartBounds, assetChartBucket, type AssetChartRange } from '@/lib/asset-chart-range';
import { toPortfolioPosition } from '@/lib/customer-portfolio';
import { AssetsPage } from '@/components/portal/assets/assets-page';

export default function PortalAssetsRoute() {
  const [range, setRange] = useState<AssetChartRange>('all');
  const bounds = assetChartBounds(range);
  const bucket = assetChartBucket(range);
  const recentBounds = assetChartBounds('all');

  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());
  const holding = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const history = useSWR(['assets/weight-history', bounds.from, bounds.to, bucket], () =>
    ordersApi.activitySummary({ ...bounds, bucket, page: 1, limit: 10 }),
  );
  const recent = useSWR(['assets/recent-activity', recentBounds.from, recentBounds.to], () =>
    ordersApi.activityList({ ...recentBounds, bucket: 'month', page: 1, limit: 10 }),
  );

  return (
    <AssetsPage
      position={toPortfolioPosition(holding.data, price.data?.normalizedValue)}
      holdingLoading={holding.isLoading}
      holdingError={Boolean(holding.error)}
      onRetryHolding={() => {
        void holding.mutate();
      }}
      price={price.data}
      priceLoading={price.isLoading}
      priceError={Boolean(price.error)}
      onRefreshPrice={() => {
        void price.mutate();
      }}
      range={range}
      onRangeChange={setRange}
      weightPoints={history.data?.series ?? []}
      historyLoading={history.isLoading}
      historyError={Boolean(history.error)}
      onRetryHistory={() => {
        void history.mutate();
      }}
      transactions={recent.data?.data.slice(0, 5) ?? []}
      transactionsLoading={recent.isLoading}
      transactionsError={Boolean(recent.error)}
      onRetryTransactions={() => {
        void recent.mutate();
      }}
    />
  );
}
