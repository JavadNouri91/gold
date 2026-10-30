'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { staffPickupsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { PickupDetailsModal } from '@/components/dashboard/pickup-details-modal';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import {
  formatDateTime,
  formatWeight,
  PICKUP_STATUS_LABELS,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';
import type { PhysicalGoldPickup } from '@/lib/api';

const STATUS_OPTIONS = [
  { value: 'REQUESTED', label: PICKUP_STATUS_LABELS.REQUESTED },
  { value: 'PREPARING', label: PICKUP_STATUS_LABELS.PREPARING },
  { value: 'READY', label: PICKUP_STATUS_LABELS.READY },
  { value: 'DELIVERED', label: PICKUP_STATUS_LABELS.DELIVERED },
  { value: 'CANCELLED', label: PICKUP_STATUS_LABELS.CANCELLED },
];

export default function StaffPickupsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'pickup.read');
  const [status, setStatus] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ pickupId: string; autoPrint: boolean } | null>(null);
  const limit = 20;

  const list = useSWR(canRead ? ['staff-pickups', appliedStatus, page] : null, () =>
    staffPickupsApi.list({
      status: appliedStatus || undefined,
      limit,
      offset: (page - 1) * limit,
    }),
  );

  if (!canRead) return <ForbiddenNotice permission="pickup.read" />;

  const columns: Column<PhysicalGoldPickup>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link href={`/dashboard/pickups/${row.id}`} className="font-medium" dir="ltr">
          {toPersianDigits(row.pickupNumber)}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => {
        const name = row.customer
          ? `${row.customer.firstName} ${row.customer.lastName}`.trim()
          : null;
        return (
          <Link href={`/dashboard/customers/${row.customerId}`} className="hover:underline">
            {name || 'پرونده مشتری'}
          </Link>
        );
      },
    },
    {
      key: 'weight',
      header: 'وزن',
      render: (row) => formatWeight(row.weightGrams),
    },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => (
        <StatusBadge status={row.status} label={statusLabel(PICKUP_STATUS_LABELS, row.status)} />
      ),
    },
    {
      key: 'requested',
      header: 'ثبت',
      render: (row) => formatDateTime(row.requestedAt),
    },
    {
      key: 'actions',
      header: 'عملیات',
      className: 'whitespace-nowrap',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            aria-label={`اقدام روی درخواست ${row.pickupNumber}`}
          >
            <Link href={`/dashboard/pickups/${row.id}`}>اقدام</Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label={`مشاهده درخواست ${row.pickupNumber}`}
            onClick={() => setDialog({ pickupId: row.id, autoPrint: false })}
          >
            نمایش
          </Button>
          <Button
            size="sm"
            className="gap-1"
            aria-label={`چاپ درخواست ${row.pickupNumber}`}
            onClick={() => setDialog({ pickupId: row.id, autoPrint: true })}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            چاپ
          </Button>
        </div>
      ),
    },
  ];

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / limit)) : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title="تحویل حضوری طلا"
        description="درخواست‌های تحویل قالب آبشده در فروشگاه را آماده‌سازی و ثبت تحویل کنید."
      />
      <FilterBar
        fields={[
          {
            key: 'status',
            label: 'وضعیت',
            type: 'select',
            options: STATUS_OPTIONS,
          },
        ]}
        values={{ status }}
        onChange={(key, value) => {
          if (key === 'status') setStatus(value);
        }}
        onSubmit={() => {
          setAppliedStatus(status);
          setPage(1);
        }}
      />
      {list.error ? <ApiErrorState error={list.error} onRetry={() => void list.mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={list.data?.data ?? []}
        isLoading={list.isLoading}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
      <PickupDetailsModal
        pickupId={dialog?.pickupId ?? null}
        open={Boolean(dialog)}
        autoPrint={dialog?.autoPrint ?? false}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
