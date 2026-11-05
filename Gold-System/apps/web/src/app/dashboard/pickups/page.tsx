'use client';

import { CancelPickupModal, CANCEL_PICKUP_SUCCESS } from '@/components/pickups/CancelPickupModal';
import { Toast } from '@/components/dashboard/customer-widgets';
import { pickupActionsFor } from '@/lib/pickup-workflow';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EMPTY_PICKUP_FILTERS,
  pickupListHref,
  readPickupFilters,
  type PickupListFilters,
} from '@/lib/pickup-list-filters';
import { Input } from '@/components/ui/input';
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
  return (
    <Suspense fallback={null}>
      <StaffPickupsList />
    </Suspense>
  );
}

function StaffPickupsList() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'pickup.read');
  const canCancel = hasPermission(user?.permissions, 'pickup.cancel');
  const [rejectPickup, setRejectPickup] = useState<PhysicalGoldPickup | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();
  const queryString = useSearchParams().toString();
  const initial = useMemo(() => readPickupFilters(new URLSearchParams(queryString)), [queryString]);
  const [draft, setDraft] = useState(initial.filters);
  const [applied, setApplied] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  useEffect(() => {
    setDraft(initial.filters);
    setApplied(initial.filters);
    setPage(initial.page);
  }, [initial]);
  const go = (filters: PickupListFilters, nextPage = 1) => {
    const next = { ...filters, search: filters.search.trim() };
    if (next.dateRange !== 'custom') {
      next.from = '';
      next.to = '';
    }
    setDraft(next);
    setApplied(next);
    setPage(nextPage);
    router.replace(pickupListHref(next, nextPage), { scroll: false });
  };
  const listHref = pickupListHref(applied, page);
  const detailHref = (id: string) =>
    `/dashboard/pickups/${id}${listHref.includes('?') ? `?returnTo=${encodeURIComponent(listHref)}` : ''}`;
  const [dialog, setDialog] = useState<{ pickupId: string; autoPrint: boolean } | null>(null);
  const limit = 20;

  const list = useSWR(canRead ? ['staff-pickups', applied, page] : null, () =>
    staffPickupsApi.list({
      search: applied.search || undefined,
      status: applied.status || undefined,
      dateRange: applied.dateRange || undefined,
      from: applied.dateRange === 'custom' ? applied.from : undefined,
      to: applied.dateRange === 'custom' ? applied.to : undefined,
      actionRequired: applied.actionRequired || undefined,
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
        <Link href={detailHref(row.id)} className="font-medium" dir="ltr">
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
            <Link href={detailHref(row.id)}>اقدام</Link>
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
          {pickupActionsFor(row.status, { prepare: false, deliver: false, cancel: canCancel })
            .cancel ? (
            <Button
              size="sm"
              variant="outline"
              className="border-red-200 text-red-700 hover:bg-red-50"
              aria-label={`لغو یا رد درخواست تحویل ${row.pickupNumber}`}
              onClick={() => {
                setFeedback(null);
                setRejectPickup(row);
              }}
            >
              لغو یا رد درخواست تحویل
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / list.data.meta.limit))
    : 1;

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="تحویل حضوری طلا"
        description="درخواست‌های تحویل قالب آبشده در فروشگاه را آماده‌سازی و ثبت تحویل کنید."
      />
      <FilterBar
        fields={[
          { key: 'search', label: 'جستجو', placeholder: 'شماره درخواست، نام مشتری یا موبایل' },
          { key: 'status', label: 'وضعیت', type: 'select', options: STATUS_OPTIONS },
          {
            key: 'dateRange',
            label: 'بازه ثبت درخواست',
            type: 'select',
            options: [
              { value: 'today', label: 'امروز' },
              { value: 'last7', label: '۷ روز گذشته' },
              { value: 'last30', label: '۳۰ روز گذشته' },
              { value: 'custom', label: 'بازه دلخواه' },
            ],
          },
        ]}
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        onSubmit={() => go(draft)}
        onReset={() => go(EMPTY_PICKUP_FILTERS)}
        resetLabel="پاک کردن فیلترها"
        extra={
          <>
            <label className="flex min-h-10 items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                checked={draft.actionRequired === 'true'}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    actionRequired: event.target.checked ? 'true' : '',
                  }))
                }
              />
              فقط درخواست‌های نیازمند اقدام
            </label>
            {draft.dateRange === 'custom' ? (
              <>
                <Input
                  label="از تاریخ"
                  type="date"
                  dir="ltr"
                  required
                  value={draft.from}
                  max={draft.to || undefined}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, from: event.target.value }))
                  }
                />
                <Input
                  label="تا تاریخ"
                  type="date"
                  dir="ltr"
                  required
                  value={draft.to}
                  min={draft.from || undefined}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, to: event.target.value }))
                  }
                />
              </>
            ) : null}
          </>
        }
      />
      {list.error ? <ApiErrorState error={list.error} onRetry={() => void list.mutate()} /> : null}
      <Toast message={feedback} onClose={() => setFeedback(null)} />
      <DataTable
        columns={columns}
        rows={list.data?.data ?? []}
        isLoading={list.isLoading}
        page={list.data ? Math.floor(list.data.meta.offset / list.data.meta.limit) + 1 : page}
        pageSize={list.data?.meta.limit ?? limit}
        totalPages={totalPages}
        onPageChange={(nextPage) => go(applied, nextPage)}
        emptyMessage="درخواست تحویلی با این فیلترها یافت نشد"
      />
      <PickupDetailsModal
        pickupId={dialog?.pickupId ?? null}
        open={Boolean(dialog)}
        autoPrint={dialog?.autoPrint ?? false}
        onClose={() => setDialog(null)}
      />
      {rejectPickup ? (
        <CancelPickupModal
          key={rejectPickup.id}
          pickup={rejectPickup}
          onClose={() => setRejectPickup(null)}
          onSuccess={() => setFeedback(CANCEL_PICKUP_SUCCESS)}
        />
      ) : null}
    </div>
  );
}
