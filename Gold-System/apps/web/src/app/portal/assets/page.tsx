'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { customerApi, ordersApi, pricingApi } from '@/lib/api';
import {
  assetChartBounds,
  assetChartBucket,
  weightHistoryBounds,
  type AssetChartRange,
  type WeightHistoryBucket,
} from '@/lib/asset-chart-range';
import { readAvailableCredit } from '@/lib/credit-view';
import { toPortfolioPosition } from '@/lib/customer-portfolio';
import { AssetsPage } from '@/components/portal/assets/assets-page';

export default function PortalAssetsRoute() {
  const [range, setRange] = useState<AssetChartRange>('all');
  const [weightBucket, setWeightBucket] = useState<WeightHistoryBucket>('month');
  const weightBounds = weightHistoryBounds(weightBucket);
  const valueBounds = assetChartBounds(range);
  const valueBucket = assetChartBucket(range);

  const price = useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());
  const holding = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const account = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const history = useSWR(['assets/weight-history', weightBounds.from, weightBounds.to, weightBucket], () =>
    ordersApi.activitySummary({ ...weightBounds, bucket: weightBucket, page: 1, limit: 10 }),
  );
  const valueHistory = useSWR(['assets/value-history', valueBounds.from, valueBounds.to, valueBucket], () =>
    ordersApi.activitySummary({ ...valueBounds, bucket: valueBucket, page: 1, limit: 10 }),
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
      availableRial={account.data ? readAvailableCredit(account.data) : null}
      onRefreshPrice={() => {
        void price.mutate();
      }}
      range={range}
      onRangeChange={setRange}
      weightBucket={weightBucket}
      onWeightBucketChange={setWeightBucket}
      weightPoints={history.data?.series ?? []}
      historyLoading={history.isLoading}
      historyError={Boolean(history.error)}
      onRetryHistory={() => {
        void history.mutate();
      }}
      valuePoints={valueHistory.data?.series ?? []}
      valueLoading={valueHistory.isLoading}
      valueError={Boolean(valueHistory.error)}
      onRetryValue={() => {
        void valueHistory.mutate();
      }}
    />
  );
}
