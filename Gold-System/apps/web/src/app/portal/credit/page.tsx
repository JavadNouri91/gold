'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { ApiClientError, customerApi, ordersApi } from '@/lib/api';
import { previewCreditTrend, type CreditTrendPeriod } from '@/lib/credit-trend-preview';
import { CreditPage } from '@/components/portal/credit/credit-page';

export default function PortalCreditRoute() {
  const account = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const accountReady = Boolean(account.data);
  const history = useSWR(accountReady ? 'customer/me/credit-transactions' : null, () =>
    customerApi.listMyCreditTransactions(20),
  );
  const orders = useSWR(accountReady ? 'customer/me/credit-orders' : null, () => {
    const to = new Date();
    const from = new Date(to.getTime() - 4 * 366 * 24 * 60 * 60 * 1000);
    return ordersApi.activityList({
      from: from.toISOString(),
      to: to.toISOString(),
      limit: 50,
    });
  });
  const [period, setPeriod] = useState<CreditTrendPeriod>('30d');
  const trend = useMemo(() => previewCreditTrend(period), [period]);
  const missing = account.error instanceof ApiClientError && account.error.isNotFound;

  return (
    <CreditPage
      account={account.data}
      accountLoading={account.isLoading}
      accountMissing={missing}
      accountError={Boolean(account.error) && !missing}
      onRetryAccount={() => {
        void account.mutate();
      }}
      entries={history.data ?? []}
      historyLoading={accountReady && history.isLoading}
      historyError={Boolean(history.error)}
      onRetryHistory={() => {
        void history.mutate();
      }}
      orders={orders.data?.data ?? []}
      ordersLoading={accountReady && orders.isLoading}
      ordersError={Boolean(orders.error)}
      onRetryOrders={() => {
        void orders.mutate();
      }}
      trend={trend}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}
