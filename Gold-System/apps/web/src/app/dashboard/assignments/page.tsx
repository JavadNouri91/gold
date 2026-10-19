'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  assignmentsApi,
  internalOrdersApi,
  type AssignmentRecord,
  type StaffOrder,
} from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  ASSIGNMENT_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  formatWeight,
  orderStatusPresentation,
  toPersianDigits,
  statusLabel,
} from '@/lib/utils';

export default function AssignmentsPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.review', 'order.assign']);
  const canReadOrders = hasPermission(user?.permissions, 'order.read');
  const canClaim = hasPermission(user?.permissions, 'trade.review');
  const [status, setStatus] = useState('ACTIVE');
  const [applied, setApplied] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['assignments', applied, page] : null,
    () => assignmentsApi.list({ status: applied || undefined, page, limit: 20 }),
  );
  const pending = useSWR(
    allowed && canReadOrders ? ['assignments-pending-quoted'] : null,
    () => internalOrdersApi.list({ status: 'QUOTED', page: 1, limit: 20 }),
  );

  if (!allowed) return <ForbiddenNotice permission="trade.review" />;

  const claim = async (orderId: string) => {
    setClaimingId(orderId);
    setClaimError(null);
    setClaimFeedback(null);
    try {
      await assignmentsApi.claim(orderId);
      setClaimFeedback('سفارش برای بررسی شما برداشت شد.');
      await Promise.all([mutate(), pending.mutate()]);
    } catch (err) {
      setClaimError(err instanceof ApiClientError ? err.message : 'برداشت سفارش انجام نشد.');
    } finally {
      setClaimingId(null);
    }
  };

  const pendingColumns: Column<StaffOrder>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/orders/${row.id}`} dir="ltr">
          {toPersianDigits(row.orderNumber)}
        </Link>
      ),
    },
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    { key: 'amount', header: 'مبلغ', render: (row) => formatMoney(row.totalAmountRial) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <StatusBadge {...orderStatusPresentation(row.status)} />
      ),
    },
    {
      key: 'action',
      header: 'اقدام',
      render: (row) =>
        canClaim ? (
          <Button
            size="sm"
            disabled={claimingId === row.id}
            isLoading={claimingId === row.id}
            onClick={() => void claim(row.id)}
          >
            برداشت برای بررسی
          </Button>
        ) : (
          <Link className="text-gold-800" href={`/dashboard/orders/${row.id}`}>
            مشاهده
          </Link>
        ),
    },
  ];

  const columns: Column<AssignmentRecord>[] = [
    {
      key: 'order',
      header: 'سفارش',
      render: (row) => <Link className="text-gold-800" href={`/dashboard/orders/${row.orderId}`}>مشاهده</Link>,
    },
    { key: 'to', header: 'بررسی‌کننده', render: (row) => <span dir="ltr">{toPersianDigits(row.assignedToId)}</span> },
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
        description="سفارش‌های قیمت‌گذاری‌شده را برداشت یا تخصیص دهید؛ تأیید نهایی همان معامله را می‌سازد."
      />
      {claimFeedback ? <Alert variant="success">{claimFeedback}</Alert> : null}
      {claimError ? <Alert variant="error">{claimError}</Alert> : null}
      {canReadOrders ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">سفارش‌های منتظر بررسی</h2>
          {pending.error ? <ApiErrorState error={pending.error} onRetry={() => void pending.mutate()} /> : null}
          <DataTable
            columns={pendingColumns}
            rows={pending.data?.orders ?? []}
            isLoading={pending.isLoading}
            emptyMessage="سفارش قیمت‌گذاری‌شده‌ای در انتظار بررسی نیست."
          />
        </div>
      ) : null}
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
