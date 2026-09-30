'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { paymentsApi, type PaymentLedgerType, type PaymentStatusGroup } from '@/lib/api';
import { activityBounds, type ActivityRangePreset } from '@/lib/activity-range';
import { MyPaymentsPage } from '@/components/portal/payments/my-payments-page';

export default function PaymentsPage() {
  const [preset, setPreset] = useState<ActivityRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [statusGroup, setStatusGroup] = useState<'' | PaymentStatusGroup>('');
  const [type, setType] = useState<'' | PaymentLedgerType>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const bounds = activityBounds(preset, { from: customFrom, to: customTo });
  const from = bounds?.from;
  const to = bounds?.to;

  useEffect(() => {
    setPage(1);
  }, [from, to, statusGroup, type, query, limit]);

  const summary = useSWR(from && to ? ['payments/summary', from, to, type, query] : null, () =>
    paymentsApi.summary({
      from: from ?? '',
      to: to ?? '',
      type: type || undefined,
      q: query || undefined,
    }),
  );
  const list = useSWR(
    from && to ? ['payments/list', from, to, page, limit, statusGroup, type, query] : null,
    () =>
      paymentsApi.list({
        from: from ?? '',
        to: to ?? '',
        page,
        limit,
        statusGroup: statusGroup || undefined,
        type: type || undefined,
        q: query || undefined,
      }),
  );

  return (
    <MyPaymentsPage
      preset={preset}
      onPreset={setPreset}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFrom={setCustomFrom}
      onCustomTo={setCustomTo}
      statusGroup={statusGroup}
      onStatusGroup={setStatusGroup}
      type={type}
      onType={setType}
      search={search}
      onSearch={setSearch}
      page={page}
      limit={limit}
      onPage={setPage}
      onLimit={setLimit}
      summary={summary.data}
      summaryLoading={summary.isLoading}
      summaryError={Boolean(summary.error)}
      onRetrySummary={() => void summary.mutate()}
      payments={list.data?.data ?? []}
      listLoading={list.isLoading}
      listError={Boolean(list.error)}
      onRetryList={() => void list.mutate()}
      meta={list.data?.meta}
      rangeReady={Boolean(bounds)}
      onReceiptSubmitted={() => {
        void summary.mutate();
        void list.mutate();
      }}
    />
  );
}
