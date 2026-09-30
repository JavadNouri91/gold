'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalCustomersApi, type StaffCustomer } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { CUSTOMER_STATUS_LABELS, formatDate, statusLabel } from '@/lib/utils';
import { MobileNumber } from '@/components/ui/mobile-input';

const REVIEW_STATUSES = ['PENDING', 'UNDER_REVIEW', 'REJECTED'];

export default function KycQueuePage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['kyc.review', 'customer.read']);
  const [status, setStatus] = useState('UNDER_REVIEW');
  const [applied, setApplied] = useState('UNDER_REVIEW');
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['kyc-queue', applied, page] : null,
    () => internalCustomersApi.list({ status: applied, page, limit: 20 }),
  );

  if (!hasPermission(user?.permissions, 'customer.read')) {
    return <ForbiddenNotice permission="customer.read" />;
  }

  const columns: Column<StaffCustomer>[] = [
    {
      key: 'name',
      header: 'مشتری',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/kyc/${row.id}`}>
          {row.fullName}
        </Link>
      ),
    },
    { key: 'mobile', header: 'موبایل', render: (row) => <MobileNumber value={row.mobile} /> },
    {
      key: 'status',
      header: 'وضعیت مشتری',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(CUSTOMER_STATUS_LABELS, row.status)} />,
    },
    { key: 'date', header: 'تاریخ ثبت', render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="صف احراز هویت"
        description="فهرست بر اساس وضعیت مشتری در سرویس مشتریان است. مدرک فقط برای کاربر مجاز باز می‌شود."
      />
      <FilterBar
        fields={[{
          key: 'status',
          label: 'وضعیت',
          type: 'select',
          options: REVIEW_STATUSES.map((value) => ({
            value,
            label: statusLabel(CUSTOMER_STATUS_LABELS, value),
          })),
        }]}
        values={{ status }}
        onChange={(_, value) => setStatus(value)}
        onSubmit={() => {
          setApplied(status || 'UNDER_REVIEW');
          setPage(1);
        }}
      />
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        isLoading={isLoading}
        page={data?.meta.page}
        totalPages={data?.meta.totalPages}
        onPageChange={setPage}
        emptyMessage="مشتری در این وضعیت نیست"
      />
    </div>
  );
}
