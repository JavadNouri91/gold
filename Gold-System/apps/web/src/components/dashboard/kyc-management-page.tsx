'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Clock3, Download, Eye, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import {
  internalKycApi,
  type KycQueueDisplay,
  type KycReviewQueueItem,
  type KycStaffBucket,
} from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';
import {
  CUSTOMER_TYPE_LABELS,
  cn,
  formatDateTime,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

const LIMIT = 20;

type Filters = {
  search: string;
  kycDisplay: string;
  customerType: string;
};

const emptyFilters: Filters = { search: '', kycDisplay: '', customerType: '' };

const KYC_DISPLAY_OPTIONS: Array<{ value: KycQueueDisplay; label: string }> = [
  { value: 'awaiting', label: 'در انتظار تایید (صف)' },
  { value: 'unverified', label: 'احراز هویت‌نشده (ناقص)' },
  { value: 'verified', label: 'احراز هویت‌شده' },
  { value: 'rejected', label: 'رد شده' },
];

const LEVEL_OPTIONS = Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

function accountStatusPresentation(status: string): { label: string; className: string } {
  if (status === 'ACTIVE') {
    return { label: 'فعال', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (status === 'SUSPENDED') {
    return { label: 'تعلیق', className: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  return { label: 'غیرفعال', className: 'bg-slate-100 text-slate-600 border-slate-200' };
}

function kycDisplayOf(row: KycReviewQueueItem): KycQueueDisplay {
  if (row.kycDisplay) return row.kycDisplay;
  if (row.bucket === 'verified' || row.bucket === 'awaiting' || row.bucket === 'unverified') {
    return row.bucket;
  }
  if (row.verificationStatus === 'REJECTED') return 'rejected';
  return 'unverified';
}

function kycStatusPresentation(display: KycQueueDisplay): { label: string; className: string } {
  if (display === 'awaiting') {
    return {
      label: 'در انتظار تایید (صف)',
      className: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  if (display === 'verified') {
    return {
      label: 'احراز هویت‌شده',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  if (display === 'rejected') {
    return {
      label: 'رد شده (مغایرت)',
      className: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  return {
    label: 'احراز هویت‌نشده',
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  };
}

function SoftPill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function KycManagementPage() {
  const { user } = useAuth();
  const allowed =
    hasPermission(user?.permissions, 'kyc.review') &&
    hasPermission(user?.permissions, 'customer.read');

  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [bucket, setBucket] = useState<KycStaffBucket | ''>('');
  const [page, setPage] = useState(1);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const kycDisplayParam =
    (applied.kycDisplay as KycQueueDisplay | '') ||
    (bucket as KycQueueDisplay | '') ||
    undefined;

  const { data, error, isLoading, mutate } = useSWR(
    allowed
      ? [
          'kyc-review-queue',
          bucket,
          applied.kycDisplay,
          applied.customerType,
          applied.search,
          page,
        ]
      : null,
    () =>
      internalKycApi.queue({
        bucket: bucket || undefined,
        kycDisplay: applied.kycDisplay
          ? (applied.kycDisplay as KycQueueDisplay)
          : undefined,
        customerType: applied.customerType || undefined,
        search: applied.search || undefined,
        page,
        limit: LIMIT,
      }),
  );

  const summary = data?.summary ?? { verified: 0, unverified: 0, awaiting: 0 };

  const selectBucket = (next: KycStaffBucket) => {
    setBucket((current) => (current === next ? '' : next));
    setDraft((current) => ({ ...current, kycDisplay: '' }));
    setApplied((current) => ({ ...current, kycDisplay: '' }));
    setPage(1);
  };

  const exportExcel = async () => {
    const rows = data?.items ?? [];
    if (!rows.length) {
      setExportNotice('ردیفی برای خروجی وجود ندارد.');
      return;
    }
    setExportNotice(null);
    const xlsx = await import('xlsx');
    const sheet = xlsx.utils.json_to_sheet(
      rows.map((row) => {
        const display = kycDisplayOf(row);
        return {
          شناسه: row.customerNumber,
          نام_مشتری: row.fullName,
          موبایل: row.mobile,
          کدملی: row.nationalId ?? '',
          وضعیت_حساب: accountStatusPresentation(row.status).label,
          وضعیت_KYC: kycStatusPresentation(display).label,
          سطح: row.customerType
            ? statusLabel(CUSTOMER_TYPE_LABELS, row.customerType)
            : '',
          آخرین_بروزرسانی: row.latestSubmittedAt,
        };
      }),
    );
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, 'kyc');
    xlsx.writeFile(book, 'kyc-queue.xlsx');
  };

  const columns: Column<KycReviewQueueItem>[] = useMemo(
    () => [
      {
        key: 'id',
        header: 'شناسه',
        render: (row) => (
          <span className="font-mono text-xs font-semibold text-slate-700" dir="ltr">
            #{toPersianDigits(row.customerNumber)}
          </span>
        ),
      },
      {
        key: 'name',
        header: 'نام مشتری',
        render: (row) => (
          <Link
            className="font-medium text-slate-900 hover:text-amber-700"
            href={`/dashboard/kyc/${row.id}`}
          >
            {row.fullName}
          </Link>
        ),
      },
      {
        key: 'mobile',
        header: 'موبایل',
        render: (row) => <MobileNumber value={row.mobile} />,
      },
      {
        key: 'account',
        header: 'وضعیت حساب',
        render: (row) => {
          const presentation = accountStatusPresentation(row.status);
          return <SoftPill label={presentation.label} className={presentation.className} />;
        },
      },
      {
        key: 'kyc',
        header: 'وضعیت KYC',
        render: (row) => {
          const presentation = kycStatusPresentation(kycDisplayOf(row));
          return <SoftPill label={presentation.label} className={presentation.className} />;
        },
      },
      {
        key: 'date',
        header: 'آخرین بروزرسانی',
        render: (row) => (
          <span className="whitespace-nowrap text-xs text-slate-600">
            {formatDateTime(row.latestSubmittedAt)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: 'عملیات',
        render: (row) => {
          const awaiting = kycDisplayOf(row) === 'awaiting';
          return (
            <Link
              href={`/dashboard/kyc/${row.id}`}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition',
                awaiting
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-slate-50',
              )}
            >
              <Eye className="h-4 w-4" aria-hidden />
              {awaiting ? 'بررسی مدارک' : 'مشاهده پرونده'}
            </Link>
          );
        },
      },
    ],
    [],
  );

  if (!allowed) {
    return <ForbiddenNotice permission="kyc.review + customer.read" />;
  }

  const kpiCards: Array<{
    id: KycStaffBucket;
    title: string;
    unit: string;
    badge: string;
    icon: typeof ShieldCheck;
    tone: string;
    badgeTone: string;
    count: number;
  }> = [
    {
      id: 'verified',
      title: 'احراز هویت‌شده (فعال)',
      unit: 'حساب',
      badge: '۱۰۰٪ تکمیل',
      icon: ShieldCheck,
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      badgeTone: 'bg-emerald-100 text-emerald-800',
      count: summary.verified,
    },
    {
      id: 'unverified',
      title: 'احراز هویت‌نشده (ناقص)',
      unit: 'حساب',
      badge: 'نیازمند تکمیل',
      icon: ShieldOff,
      tone: 'border-slate-200 bg-slate-50 text-slate-800',
      badgeTone: 'bg-slate-200/70 text-slate-700',
      count: summary.unverified,
    },
    {
      id: 'awaiting',
      title: 'در انتظار تایید مدارک (صف)',
      unit: 'پرونده',
      badge: 'نیازمند بررسی اپراتور',
      icon: Clock3,
      tone: 'border-amber-400 bg-amber-50 text-amber-700',
      badgeTone: 'bg-amber-100 text-amber-800',
      count: summary.awaiting,
    },
  ];

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="مدیریت احراز هویت مشتریان (KYC)"
        description="بررسی و تایید مدارک هویتی و بانکی کاربران سامانه"
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          const active = bucket === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => selectBucket(card.id)}
              className="text-right"
            >
              <div
                className={cn(
                  'rounded-xl border p-4 shadow-sm transition',
                  card.tone,
                  active && 'ring-2 ring-amber-500 ring-offset-2',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{card.title}</p>
                    <p className="mt-2 text-2xl font-bold tabular-nums">
                      {isLoading
                        ? '—'
                        : `${toPersianDigits(String(card.count))} ${card.unit}`}
                    </p>
                    <span
                      className={cn(
                        'mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                        card.badgeTone,
                      )}
                    >
                      {card.badge}
                    </span>
                  </div>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 opacity-80" aria-hidden />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <form
        className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm lg:flex-row lg:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setBucket('');
          setPage(1);
        }}
      >
        <label className="relative block min-w-0 flex-1 text-sm">
          <span className="sr-only">جستجو</span>
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-lg border border-input bg-background pr-10 pl-3 text-sm"
            placeholder="جستجو (نام، موبایل، کدملی)"
            value={draft.search}
            onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))}
          />
        </label>
        <label className="text-sm lg:w-44">
          <span className="sr-only">وضعیت</span>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={draft.kycDisplay}
            onChange={(event) =>
              setDraft((current) => ({ ...current, kycDisplay: event.target.value }))
            }
          >
            <option value="">وضعیت: همه</option>
            {KYC_DISPLAY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm lg:w-40">
          <span className="sr-only">سطح</span>
          <select
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={draft.customerType}
            onChange={(event) =>
              setDraft((current) => ({ ...current, customerType: event.target.value }))
            }
          >
            <option value="">سطح: همه</option>
            {LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            اعمال فیلتر
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(emptyFilters);
              setApplied(emptyFilters);
              setBucket('');
              setPage(1);
            }}
          >
            پاک کردن
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void exportExcel()}
          >
            <Download className="ml-1.5 h-4 w-4" aria-hidden />
            خروجی اکسل
          </Button>
        </div>
      </form>

      {exportNotice ? (
        <p className="text-sm text-amber-700" role="status">
          {exportNotice}
        </p>
      ) : null}

      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}

      <div className="rounded-xl border border-gray-100 bg-white p-1 shadow-sm">
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          isLoading={isLoading}
          page={data?.meta.page}
          totalPages={data?.meta.totalPages}
          total={data?.meta.total}
          pageSize={data?.meta.limit}
          onPageChange={setPage}
          emptyMessage={
            kycDisplayParam === 'awaiting'
              ? 'مدرک منتظر تأییدی در این فیلتر وجود ندارد'
              : kycDisplayParam === 'verified'
                ? 'مشتری احراز هویت‌شده‌ای در این فیلتر نیست'
                : kycDisplayParam === 'rejected'
                  ? 'پرونده رد شده‌ای در این فیلتر نیست'
                  : 'موردی یافت نشد'
          }
        />
      </div>
    </div>
  );
}
