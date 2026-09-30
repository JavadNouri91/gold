'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalTradesApi, tradesFromList, type StaffTrade } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { TRADE_STATUS_LABELS, formatDateTime, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function TradesPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.read', 'trade.approve']);
  const [status, setStatus] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['trades', applied, page] : null,
    () => internalTradesApi.list({ status: applied || undefined, page, limit: 20 }),
  );
  const rows = tradesFromList(data);

  if (!allowed) return <ForbiddenNotice permission="trade.read" />;

  const columns: Column<StaffTrade>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link href={`/dashboard/trades/${row.id}`} className="font-medium text-gold-800" dir="ltr">
          {row.tradeNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => <Link href={`/dashboard/customers/${row.customerId}`}>مشتری</Link>,
    },
    {
      key: 'order',
      header: 'سفارش',
      render: (row) => <Link href={`/dashboard/orders/${row.orderId}`}>سفارش</Link>,
    },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.totalAmountRial) },
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(TRADE_STATUS_LABELS, row.status)} />,
    },
    { key: 'date', header: 'تأیید', render: (row) => formatDateTime(row.confirmedAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="معاملات" description="تأیید دوم و آستانه مبلغ در این صفحه محاسبه نمی‌شود." />
      <FilterBar
        fields={[{
          key: 'status',
          label: 'وضعیت',
          type: 'select',
          options: Object.entries(TRADE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        }]}
        values={{ status }}
        onChange={(_, value) => setStatus(value)}
        onSubmit={() => {
          setApplied(status);
          setPage(1);
        }}
        onReset={() => {
          setStatus('');
          setApplied('');
          setPage(1);
        }}
      />
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        page={data?.page}
        totalPages={data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1}
        onPageChange={setPage}
      />
    </div>
  );
}
