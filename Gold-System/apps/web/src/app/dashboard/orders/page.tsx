'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalOrdersApi, type StaffOrder } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { ORDER_STATUS_LABELS, formatDate, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function OrdersPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'order.read');
  const [draft, setDraft] = useState({ status: '', customerId: '' });
  const [applied, setApplied] = useState(draft);
  useEffect(() => {
    const customerId = new URLSearchParams(window.location.search).get('customerId') ?? '';
    if (!customerId) return;
    setDraft((current) => ({ ...current, customerId }));
    setApplied((current) => ({ ...current, customerId }));
  }, []);
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['orders', applied, page] : null,
    () =>
      internalOrdersApi.list({
        status: applied.status || undefined,
        customerId: applied.customerId || undefined,
        page,
        limit: 20,
      }),
  );

  if (!allowed) return <ForbiddenNotice permission="order.read" />;

  const columns: Column<StaffOrder>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/orders/${row.id}`} dir="ltr">
          {row.orderNumber}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => <Link href={`/dashboard/customers/${row.customerId}`}>پرونده</Link>,
    },
    { key: 'date', header: 'تاریخ', render: (row) => formatDate(row.createdAt) },
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.totalAmountRial) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(ORDER_STATUS_LABELS, row.status)} />,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="سفارش‌ها" description="وضعیت‌ها همان مقادیر ماشین وضعیت سرور هستند." />
      <FilterBar
        fields={[
          {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
          },
          { key: 'customerId', label: 'شناسه مشتری', dir: 'ltr' },
        ]}
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        onSubmit={() => {
          setApplied(draft);
          setPage(1);
        }}
        onReset={() => {
          const empty = { status: '', customerId: '' };
          setDraft(empty);
          setApplied(empty);
          setPage(1);
        }}
      />
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={data?.orders ?? []}
        isLoading={isLoading}
        page={data?.meta.page}
        totalPages={data?.meta.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
