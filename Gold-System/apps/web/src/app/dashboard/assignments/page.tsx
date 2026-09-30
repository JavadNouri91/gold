'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { assignmentsApi, type AssignmentRecord } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { ASSIGNMENT_STATUS_LABELS, formatDateTime, statusLabel } from '@/lib/utils';

export default function AssignmentsPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.review', 'order.assign']);
  const [status, setStatus] = useState('ACTIVE');
  const [applied, setApplied] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['assignments', applied, page] : null,
    () => assignmentsApi.list({ status: applied || undefined, page, limit: 20 }),
  );

  if (!allowed) return <ForbiddenNotice permission="trade.review" />;

  const columns: Column<AssignmentRecord>[] = [
    {
      key: 'order',
      header: 'سفارش',
      render: (row) => <Link className="text-gold-800" href={`/dashboard/orders/${row.orderId}`}>مشاهده</Link>,
    },
    { key: 'to', header: 'بررسی‌کننده', render: (row) => <span dir="ltr">{row.assignedToId}</span> },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <StatusBadge status={row.status} label={statusLabel(ASSIGNMENT_STATUS_LABELS, row.status)} />
      ),
    },
    { key: 'date', header: 'تاریخ', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="صف بررسی"
        description="کارشناس بررسی صف خودش را می‌بیند. کاربری که مجوز تخصیص دارد همه موارد را می‌بیند. این تفکیک در سرور انجام می‌شود."
      />
      <FilterBar
        fields={[{
          key: 'status',
          label: 'وضعیت تخصیص',
          type: 'select',
          options: Object.entries(ASSIGNMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
        }]}
        values={{ status }}
        onChange={(_, value) => setStatus(value)}
        onSubmit={() => {
          setApplied(status);
          setPage(1);
        }}
      />
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={data?.assignments ?? []}
        isLoading={isLoading}
        page={data?.meta.page}
        totalPages={data?.meta.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
