'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ordersApi, type ActivityBucket } from '@/lib/api';
import { activityBounds, type ActivityRangePreset } from '@/lib/activity-range';
import { MyTradesPage } from '@/components/portal/trades/my-trades-page';

export default function PortalTradesRoute() {
  const [preset, setPreset] = useState<ActivityRangePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [bucket, setBucket] = useState<ActivityBucket>('month');
  const [side, setSide] = useState<'' | 'BUY' | 'SELL'>('');
  const [status, setStatus] = useState('');
  const [purity, setPurity] = useState('');
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
  }, [from, to, side, status, purity, query, limit]);

  const summary = useSWR(from && to ? ['orders/activity/summary', from, to, bucket, side, status, purity, query] : null, () =>
    ordersApi.activitySummary({
      from: from ?? '',
      to: to ?? '',
      bucket,
      side: side || undefined,
      status: status || undefined,
      purityRatio: purity || undefined,
      q: query || undefined,
    }),
  );
  const list = useSWR(from && to ? ['orders/activity', from, to, page, limit, side, status, purity, query] : null, () =>
    ordersApi.activityList({
      from: from ?? '',
      to: to ?? '',
      page,
      limit,
      side: side || undefined,
      status: status || undefined,
      purityRatio: purity || undefined,
      q: query || undefined,
    }),
  );

  return (
    <MyTradesPage
      preset={preset}
      onPreset={setPreset}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFrom={setCustomFrom}
      onCustomTo={setCustomTo}
      bucket={bucket}
      onBucket={setBucket}
      side={side}
      status={status}
      purity={purity}
      search={search}
      onSide={setSide}
      onStatus={setStatus}
      onPurity={setPurity}
      onSearch={setSearch}
      onClearFilters={() => {
        setSide('');
        setStatus('');
        setPurity('');
        setSearch('');
        setQuery('');
      }}
      page={page}
      limit={limit}
      onPage={setPage}
      onLimit={(next) => {
        setLimit(next);
        setPage(1);
      }}
      summary={summary.data}
      summaryLoading={summary.isLoading}
      summaryError={Boolean(summary.error)}
      onRetrySummary={() => {
        void summary.mutate();
      }}
      list={list.data}
      listLoading={list.isLoading}
      listError={Boolean(list.error)}
      onRetryList={() => {
        void list.mutate();
      }}
      rangeReady={Boolean(from && to)}
    />
  );
}
