'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalQuotationsApi, type StaffQuotation } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { QUOTATION_STATUS_LABELS, formatDateTime, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function QuotationsPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'quotation.read');
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['quotations', page] : null,
    () => internalQuotationsApi.list({ page, limit: 20 }),
  );

  if (!allowed) return <ForbiddenNotice permission="quotation.read" />;

  const columns: Column<StaffQuotation>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/quotations/${row.id}`} dir="ltr">
          {row.quotationNumber}
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
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.totalAmountRial) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(QUOTATION_STATUS_LABELS, row.status)} />,
    },
    { key: 'date', header: 'تاریخ', render: (row) => formatDateTime(row.generatedAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="پیش‌فاکتورها"
        description="فهرست از سرویس پیش‌فاکتور خوانده می‌شود. مبلغ‌ها تصویر قفل‌شده هستند."
      />
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={data?.quotations ?? []}
        isLoading={isLoading}
        page={data?.meta.page}
        totalPages={data?.meta.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
