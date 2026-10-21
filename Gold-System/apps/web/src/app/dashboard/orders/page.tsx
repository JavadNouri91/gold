'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import useSWR from 'swr';
import { ClipboardList, ShoppingCart, UserCheck } from 'lucide-react';
import { DatePickerJalali } from '@/components/ui/date-picker-jalali';
import { ACTIVITY_RANGE_OPTIONS, activityBounds, type ActivityRangePreset } from '@/lib/activity-range';
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
import { OrderQuotationActions } from '@/components/dashboard/order-quotation-actions';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  ASSIGNMENT_STATUS_LABELS,
  ORDER_STATUS_FILTER_OPTIONS,
  cn,
  formatDate,
  formatDateTime,
  formatFaNumber,
  formatMoney,
  formatWeight,
  orderStatusPresentation,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

type OrdersView = 'all' | 'review' | 'assignments';
type OrdersRange = 'all' | ActivityRangePreset;

const ORDER_RANGE_OPTIONS: { id: OrdersRange; label: string }[] = [
  { id: 'all', label: 'همه زمان‌ها' },
  ...ACTIVITY_RANGE_OPTIONS,
];

const HERO_TONE = {
  gold: {
    shell: 'border-gold-200/80 bg-gold-50',
    icon: 'bg-gold-100 text-gold-800',
    value: 'text-gold-950',
    label: 'text-gold-900',
  },
  amber: {
    shell: 'border-amber-200/80 bg-amber-50',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-950',
    label: 'text-amber-900',
  },
  sky: {
    shell: 'border-sky-200/80 bg-sky-50',
    icon: 'bg-sky-100 text-sky-700',
    value: 'text-sky-950',
    label: 'text-sky-900',
  },
} as const;

function isOrdersView(value: string | null): value is OrdersView {
  return value === 'all' || value === 'review' || value === 'assignments';
}

function RangeFilterFields({
  preset,
  customFrom,
  customTo,
  onPreset,
  onCustomFrom,
  onCustomTo,
}: {
  preset: OrdersRange;
  customFrom: string;
  customTo: string;
  onPreset: (value: OrdersRange) => void;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
}) {
  return (
    <>
      <label className="space-y-1 text-sm">
        <span className="font-medium">بازه زمانی</span>
        <select
          aria-label="بازه زمانی"
          className="h-10 w-full rounded-md border border-input bg-background px-3 font-sans text-sm"
          value={preset}
          onChange={(event) => onPreset(event.target.value as OrdersRange)}
        >
          {ORDER_RANGE_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {preset === 'custom' ? (
        <>
          <DatePickerJalali label="از" value={customFrom} allowFuture={false} onChange={onCustomFrom} />
          <DatePickerJalali label="تا" value={customTo} allowFuture={false} onChange={onCustomTo} />
        </>
      ) : null}
    </>
  );
}

function HeroCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  selected,
  onSelect,
}: {
  label: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof HERO_TONE;
  selected: boolean;
  onSelect: () => void;
}) {
  const colors = HERO_TONE[tone];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-2xl border p-5 text-right shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-400',
        colors.shell,
        selected && 'ring-2 ring-gold-500 ring-offset-2',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <p className={cn('text-sm font-semibold', colors.label)}>{label}</p>
        </div>
        <p className={cn('shrink-0 text-3xl font-bold tabular-nums', colors.value)}>{value}</p>
      </div>
      <p className="mt-3 text-xs text-slate-600">{hint}</p>
    </button>
  );
}

export default function OrdersPage() {
  const { user } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const canReadOrders = hasPermission(user?.permissions, 'order.read');
  const canReadQuotes = hasPermission(user?.permissions, 'quotation.read');
  const canAssign = hasPermission(user?.permissions, 'order.assign');
  const canReview = hasPermission(user?.permissions, 'trade.review');
  const canClaim = canReview;
  const canQueue = canReview || canAssign;
  const views = useMemo(() => {
    const next: OrdersView[] = [];
    if (canReadOrders) next.push('all');
    if (canQueue && canReadOrders) next.push('review');
    if (canReview) next.push('assignments');
    return next;
  }, [canReadOrders, canQueue, canReview]);

  const requested = search.get('view');
  const view: OrdersView =
    isOrdersView(requested) && views.includes(requested) ? requested : (views[0] ?? 'all');

  const [filters, setFilters] = useState({ status: '', customerId: '' });
  const [ordersPage, setOrdersPage] = useState(1);
  const [assignmentStatus, setAssignmentStatus] = useState('ACTIVE');
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<OrdersRange>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const bounds = rangePreset === 'all' ? { from: undefined, to: undefined } : activityBounds(rangePreset, {
    from: customFrom,
    to: customTo,
  });
  const rangeReady = rangePreset === 'all' || bounds != null;
  const from = bounds?.from;
  const to = bounds?.to;

  useEffect(() => {
    const customerId = search.get('customerId') ?? '';
    if (!customerId) return;
    setFilters((current) => ({ ...current, customerId }));
  }, [search]);

  const orders = useSWR(
    canReadOrders && rangeReady ? ['orders', filters, ordersPage, from, to] : null,
    () =>
      internalOrdersApi.list({
        status: filters.status || undefined,
        customerId: filters.customerId || undefined,
        from,
        to,
        page: ordersPage,
        limit: 20,
      }),
  );
  const pending = useSWR(
    canQueue && canReadOrders && rangeReady ? ['orders-pending-quoted', from, to] : null,
    () => internalOrdersApi.list({ status: 'QUOTED', from, to, page: 1, limit: 20 }),
  );
  const assignments = useSWR(
    canReview && rangeReady ? ['assignments', assignmentStatus, assignmentPage, from, to] : null,
    () =>
      assignmentsApi.list({
        status: assignmentStatus || undefined,
        from,
        to,
        page: assignmentPage,
        limit: 20,
      }),
  );

  if (views.length === 0) return <ForbiddenNotice permission="order.read" />;

  const setView = (next: OrdersView) => {
    const params = new URLSearchParams(search.toString());
    if (next === views[0]) params.delete('view');
    else params.set('view', next);
    const query = params.toString();
    setClaimError(null);
    setClaimFeedback(null);
    router.replace(query ? `/dashboard/orders?${query}` : '/dashboard/orders');
  };

  const claim = async (orderId: string) => {
    setClaimingId(orderId);
    setClaimError(null);
    setClaimFeedback(null);
    try {
      await assignmentsApi.claim(orderId);
      setClaimFeedback('سفارش برای بررسی شما برداشت شد.');
      await Promise.all([pending.mutate(), assignments.mutate()]);
    } catch (err) {
      setClaimError(err instanceof ApiClientError ? err.message : 'برداشت سفارش انجام نشد.');
    } finally {
      setClaimingId(null);
    }
  };

  const orderColumns: Column<StaffOrder>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/orders/${row.id}`} dir="ltr">
          {toPersianDigits(row.orderNumber)}
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
      render: (row) => <StatusBadge {...orderStatusPresentation(row.status)} />,
    },
    ...(canReadQuotes
      ? [
          {
            key: 'quotation',
            header: 'پیش‌فاکتور',
            render: (row: StaffOrder) => (
              <OrderQuotationActions orderId={row.id} status={row.status} />
            ),
          } satisfies Column<StaffOrder>,
        ]
      : []),
  ];

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
      render: (row) => <StatusBadge {...orderStatusPresentation(row.status)} />,
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
    ...(canReadQuotes
      ? [
          {
            key: 'quotation',
            header: 'پیش‌فاکتور',
            render: (row: StaffOrder) => (
              <OrderQuotationActions orderId={row.id} status={row.status} />
            ),
          } satisfies Column<StaffOrder>,
        ]
      : []),
  ];

  const assignmentColumns: Column<AssignmentRecord>[] = [
    {
      key: 'order',
      header: 'سفارش',
      render: (row) => (
        <Link className="text-gold-800" href={`/dashboard/orders/${row.orderId}`}>
          مشاهده
        </Link>
      ),
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
    ...(canReadQuotes
      ? [
          {
            key: 'quotation',
            header: 'پیش‌فاکتور',
            render: (row: AssignmentRecord) => <OrderQuotationActions orderId={row.orderId} />,
          } satisfies Column<AssignmentRecord>,
        ]
      : []),
  ];

  const heroes = [
    views.includes('all')
      ? {
          id: 'all' as const,
          label: 'همه سفارش‌ها',
          hint: 'فهرست کامل با فیلتر وضعیت',
          icon: ShoppingCart,
          tone: 'gold' as const,
          value: formatFaNumber(orders.data?.meta.total ?? 0),
        }
      : null,
    views.includes('review')
      ? {
          id: 'review' as const,
          label: 'منتظر بررسی',
          hint: 'سفارش‌های قیمت‌گذاری‌شده برای برداشت',
          icon: ClipboardList,
          tone: 'amber' as const,
          value: formatFaNumber(pending.data?.meta.total ?? pending.data?.orders.length ?? 0),
        }
      : null,
    views.includes('assignments')
      ? {
          id: 'assignments' as const,
          label: 'تخصیص‌ها',
          hint: 'صف بررسی‌کننده‌ها و تاریخچه تخصیص',
          icon: UserCheck,
          tone: 'sky' as const,
          value: formatFaNumber(assignments.data?.meta.total ?? assignments.data?.total ?? 0),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item != null);

  const rangeFields = (
    <RangeFilterFields
      preset={rangePreset}
      customFrom={customFrom}
      customTo={customTo}
      onPreset={(value) => {
        setRangePreset(value);
        setOrdersPage(1);
        setAssignmentPage(1);
      }}
      onCustomFrom={(value) => {
        setCustomFrom(value);
        setOrdersPage(1);
        setAssignmentPage(1);
      }}
      onCustomTo={(value) => {
        setCustomTo(value);
        setOrdersPage(1);
        setAssignmentPage(1);
      }}
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader title="سفارش‌ها" />

      {heroes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {heroes.map((item) => (
            <HeroCard
              key={item.id}
              label={item.label}
              value={item.value}
              hint={item.hint}
              icon={item.icon}
              tone={item.tone}
              selected={view === item.id}
              onSelect={() => setView(item.id)}
            />
          ))}
        </div>
      ) : null}

      {view === 'all' ? (
        <>
          <FilterBar
            fields={[
              {
                key: 'status',
                label: 'وضعیت',
                type: 'select',
                options: ORDER_STATUS_FILTER_OPTIONS,
              },
              { key: 'customerId', label: 'شناسه مشتری', dir: 'ltr' },
            ]}
            extra={rangeFields}
            live
            values={filters}
            onChange={(key, value) => {
              setFilters((current) => ({ ...current, [key]: value }));
              setOrdersPage(1);
            }}
            onReset={() => {
              setFilters({ status: '', customerId: '' });
              setOrdersPage(1);
            }}
          />
          {orders.error ? <ApiErrorState error={orders.error} onRetry={() => void orders.mutate()} /> : null}
          <DataTable
            columns={orderColumns}
            rows={orders.data?.orders ?? []}
            isLoading={orders.isLoading}
            page={orders.data?.meta.page}
            totalPages={orders.data?.meta.totalPages}
            onPageChange={setOrdersPage}
          />
        </>
      ) : null}

      {view === 'review' ? (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
            {rangeFields}
          </div>
          {claimFeedback ? <Alert variant="success">{claimFeedback}</Alert> : null}
          {claimError ? <Alert variant="error">{claimError}</Alert> : null}
          {pending.error ? <ApiErrorState error={pending.error} onRetry={() => void pending.mutate()} /> : null}
          <DataTable
            columns={pendingColumns}
            rows={pending.data?.orders ?? []}
            isLoading={pending.isLoading}
            emptyMessage="سفارش قیمت‌گذاری‌شده‌ای در انتظار بررسی نیست."
          />
        </>
      ) : null}

      {view === 'assignments' ? (
        <>
          <FilterBar
            fields={[{
              key: 'status',
              label: 'وضعیت تخصیص',
              type: 'select',
              options: Object.entries(ASSIGNMENT_STATUS_LABELS).map(([value, label]) => ({ value, label })),
            }]}
            extra={rangeFields}
            live
            values={{ status: assignmentStatus }}
            onChange={(_, value) => {
              setAssignmentStatus(value);
              setAssignmentPage(1);
            }}
          />
          {assignments.error ? (
            <ApiErrorState error={assignments.error} onRetry={() => void assignments.mutate()} />
          ) : null}
          <DataTable
            columns={assignmentColumns}
            rows={assignments.data?.assignments ?? []}
            isLoading={assignments.isLoading}
            page={assignments.data?.meta.page}
            totalPages={assignments.data?.meta.totalPages}
            onPageChange={setAssignmentPage}
          />
        </>
      ) : null}
    </div>
  );
}
