'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardCheck, Clock3, ShieldCheck, ShieldOff } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  internalKycApi,
  type KycReviewQueueItem,
  type KycStaffBucket,
} from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  CUSTOMER_STATUS_LABELS,
  cn,
  formatDateTime,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';
import { MobileNumber } from '@/components/ui/mobile-input';

const REVIEW_STATUSES = [
  { value: 'PENDING', label: 'منتظر مشاهده' },
  { value: 'UNDER_REVIEW', label: 'مشاهده‌شده و منتظر تصمیم' },
];

const BUCKETS: Array<{
  id: KycStaffBucket;
  title: string;
  hint: string;
  icon: typeof ShieldCheck;
  tone: string;
}> = [
  {
    id: 'verified',
    title: 'احراز هویت‌شده',
    hint: 'پرونده و همه مدارک الزامی تأیید شده است',
    icon: ShieldCheck,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    id: 'unverified',
    title: 'احراز هویت‌نشده',
    hint: 'مدارک کامل نیست یا هنوز ارسال نشده است',
    icon: ShieldOff,
    tone: 'border-slate-200 bg-slate-50 text-slate-800',
  },
  {
    id: 'awaiting',
    title: 'در انتظار تأیید مدارک',
    hint: 'مدارک ارسال شده و منتظر بررسی کارشناس است',
    icon: Clock3,
    tone: 'border-amber-200 bg-amber-50 text-amber-900',
  },
];

const EMPTY_MESSAGE: Record<KycStaffBucket, string> = {
  verified: 'مشتری احراز هویت‌شده‌ای در این فیلتر نیست',
  unverified: 'مشتری احراز هویت‌نشده‌ای در این فیلتر نیست',
  awaiting: 'مدرک منتظر تأییدی در این فیلتر وجود ندارد',
};

export default function KycQueuePage() {
  const { user } = useAuth();
  const allowed =
    hasPermission(user?.permissions, 'kyc.review') &&
    hasPermission(user?.permissions, 'customer.read');
  const [bucket, setBucket] = useState<KycStaffBucket>('awaiting');
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [applied, setApplied] = useState({ status: '', search: '' });
  const [page, setPage] = useState(1);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['kyc-review-queue', bucket, applied.status, applied.search, page] : null,
    () =>
      internalKycApi.queue({
        bucket,
        status: bucket === 'awaiting' ? applied.status || undefined : undefined,
        search: applied.search || undefined,
        page,
        limit: 20,
      }),
  );

  if (!allowed) {
    return <ForbiddenNotice permission="kyc.review + customer.read" />;
  }

  const summary = data?.summary ?? { verified: 0, unverified: 0, awaiting: 0 };

  const columns: Column<KycReviewQueueItem>[] = [
    {
      key: 'name',
      header: 'مشتری',
      render: (row) => (
        <div>
          <Link className="font-medium text-gold-800" href={`/dashboard/kyc/${row.id}`}>
            {row.fullName}
          </Link>
          <p dir="ltr" className="mt-1 text-xs text-muted-foreground">
            {toPersianDigits(row.customerNumber)}
          </p>
        </div>
      ),
    },
    { key: 'mobile', header: 'موبایل', render: (row) => <MobileNumber value={row.mobile} /> },
    {
      key: 'status',
      header: 'وضعیت مشتری',
      render: (row) => (
        <StatusBadge
          status={row.status}
          label={statusLabel(CUSTOMER_STATUS_LABELS, row.status)}
        />
      ),
    },
    {
      key: 'documents',
      header: bucket === 'awaiting' ? 'مدارک منتظر اقدام' : 'وضعیت احراز هویت',
      render: (row) =>
        bucket === 'awaiting' ? (
          <div className="flex flex-wrap gap-2">
            {row.pendingDocuments > 0 ? (
              <StatusBadge
                status="PENDING"
                label={`${toPersianDigits(String(row.pendingDocuments))} منتظر مشاهده`}
              />
            ) : null}
            {row.viewedDocuments > 0 ? (
              <StatusBadge
                status="UNDER_REVIEW"
                label={`${toPersianDigits(String(row.viewedDocuments))} منتظر تصمیم`}
              />
            ) : null}
          </div>
        ) : (
          <StatusBadge
            status={bucket === 'verified' ? 'APPROVED' : 'PENDING'}
            label={bucket === 'verified' ? 'احراز هویت‌شده' : 'احراز هویت‌نشده'}
          />
        ),
    },
    {
      key: 'date',
      header: 'آخرین به‌روزرسانی',
      render: (row) => formatDateTime(row.latestSubmittedAt),
    },
    {
      key: 'quick-access',
      header: 'دسترسی سریع',
      render: (row) => (
        <Button asChild size="sm">
          <Link href={`/dashboard/kyc/${row.id}`}>
            <ClipboardCheck className="ml-1 h-4 w-4" aria-hidden />
            {bucket === 'awaiting' ? 'بررسی و تأیید مدارک' : 'مشاهده پرونده'}
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="احراز هویت مشتریان"
        description="مشتریان بر اساس نتیجه احراز هویت و وضعیت مدارک ارسال‌شده دسته‌بندی می‌شوند."
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {BUCKETS.map((item) => {
          const Icon = item.icon;
          const count = summary[item.id];
          const active = bucket === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setBucket(item.id);
                setPage(1);
              }}
              className="text-right"
            >
              <Card className={cn(item.tone, active && 'ring-2 ring-gold-500 ring-offset-2')}>
                <CardContent className="flex items-start gap-3 p-4">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-2xl font-bold">
                      {isLoading ? '—' : toPersianDigits(String(count))}
                    </p>
                    <p className="mt-1 text-xs opacity-80">{item.hint}</p>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
      <FilterBar
        fields={[
          {
            key: 'search',
            label: 'جستجو',
            type: 'text',
            placeholder: 'نام، شماره موبایل یا شماره مشتری',
          },
          ...(bucket === 'awaiting'
            ? [
                {
                  key: 'status',
                  label: 'وضعیت مدرک',
                  type: 'select' as const,
                  options: REVIEW_STATUSES,
                },
              ]
            : []),
        ]}
        values={filters}
        onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onSubmit={() => {
          setApplied(filters);
          setPage(1);
        }}
        onReset={() => {
          setFilters({ status: '', search: '' });
          setApplied({ status: '', search: '' });
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
        total={data?.meta.total}
        pageSize={data?.meta.limit}
        onPageChange={setPage}
        emptyMessage={EMPTY_MESSAGE[bucket]}
      />
    </div>
  );
}
