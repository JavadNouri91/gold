'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ban, CheckCircle2, Plus, Search } from 'lucide-react';
import useSWR from 'swr';
import { ordersApi, pickupsApi } from '@/lib/api';
import { toPortfolioPosition, isRegisteredHolding } from '@/lib/customer-portfolio';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert, EmptyState } from '@/components/ui/alert';
import { NewPickupModal } from '@/components/portal/pickups/new-pickup-modal';
import { pickupStepTimestamps } from '@/components/portal/pickups/pickup-status-stepper';
import { pickupCancelActorName } from '@/lib/pickup-cancel-label';
import { cn, formatDate, PICKUP_STATUS_LABELS, toPersianDigits } from '@/lib/utils';

const filters = [
  { value: 'all', label: 'همه' },
  { value: 'active', label: 'در حال پردازش' },
  { value: 'delivered', label: 'تحویل‌شده' },
  { value: 'cancelled', label: 'لغو شده' },
] as const;
type Filter = (typeof filters)[number]['value'];
const numberFormat = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 8 });
const grams = (value: string | number) => `${numberFormat.format(Number(value))} گرم`;
const normalizeSearch = (value: string) =>
  value
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[\u200c\u200e\u200f]/g, '')
    .trim()
    .toLowerCase();

export default function PortalPickupsPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const { data, error, isLoading } = useSWR('portal-pickups', () => pickupsApi.list({ limit: 50 }));
  const { data: holding } = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const position = toPortfolioPosition(holding);
  const available = isRegisteredHolding(position) ? position : null;
  const reservedGrams = holding?.reservedPickupGrams ?? '0';
  const query = normalizeSearch(search);
  const pickups =
    data?.data?.filter((pickup) => {
      const group =
        pickup.status === 'CANCELLED'
          ? 'cancelled'
          : pickup.status === 'DELIVERED'
            ? 'delivered'
            : 'active';
      const dates = [pickup.requestedAt, pickup.deliveredAt, pickup.cancelledAt].filter(Boolean);
      const searchable = [
        pickup.pickupNumber,
        ...dates.flatMap((date) => [
          date!,
          formatDate(date),
          new Date(date!).toLocaleDateString('fa-IR'),
        ]),
      ].join(' ');
      return (filter === 'all' || filter === group) && normalizeSearch(searchable).includes(query);
    }) ?? [];

  if (isLoading && !data) return <PageSpinner />;

  return (
    <div dir="rtl" className="space-y-6 text-slate-900">
      <div>
        <h1 className="text-2xl font-bold">تحویل حضوری</h1>
        <p className="mt-1 text-sm leading-7 text-slate-500">
          درخواست‌ها و وضعیت تحویل طلای آب‌شده خود را مدیریت کنید.
        </p>
      </div>

      <section
        aria-label="موجودی و درخواست تحویل"
        className="relative isolate overflow-hidden rounded-2xl border border-amber-300/60 bg-gradient-to-l from-[#d8aa51] via-[#f8df94] to-[#c79336] p-6 shadow-sm sm:p-8"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-16 left-12 -z-10 h-64 w-32 rotate-45 rounded-2xl border-[12px] border-white/10 shadow-[60px_0_0_0_rgba(255,255,255,0.08),120px_0_0_0_rgba(255,255,255,0.06)]"
        />
        <div className="grid items-center gap-6 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <p className="text-sm font-medium text-amber-950/80">موجودی طلای قابل درخواست</p>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-amber-950 sm:text-4xl">
              {grams(available?.weightGrams ?? '0')}
            </p>
          </div>
          <div className="border-amber-900/20 sm:border-s sm:ps-6">
            <p className="text-sm font-medium text-amber-950/80">طلای در انتظار تحویل</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-amber-950">
              {grams(reservedGrams)}
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setNewOpen(true)}
            className="h-12 gap-2 rounded-xl bg-amber-900 px-6 text-white shadow-sm hover:bg-amber-950"
          >
            <Plus className="h-5 w-5" aria-hidden="true" /> درخواست جدید
          </Button>
        </div>
      </section>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div
          role="group"
          aria-label="فیلتر وضعیت درخواست‌ها"
          className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1"
        >
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn(
                'shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
                filter === item.value
                  ? 'bg-slate-900 text-amber-300 shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="relative block w-full xl:max-w-sm">
          <span className="sr-only">جستجوی درخواست‌ها بر اساس شماره یا تاریخ</span>
          <Search
            className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جستجو بر اساس شماره درخواست یا کد..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pe-3 ps-10 text-sm outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </label>
      </div>

      {error ? <Alert variant="error">خطا در بارگذاری درخواست‌ها</Alert> : null}
      {!error && pickups.length === 0 ? (
        <EmptyState
          icon="📦"
          message={
            data?.data?.length
              ? 'درخواستی با این مشخصات پیدا نشد'
              : 'هنوز درخواست تحویل حضوری ندارید'
          }
          description={
            data?.data?.length
              ? 'فیلتر وضعیت یا عبارت جستجو را تغییر دهید.'
              : 'از موجودی طلای آب‌شده خود درخواست تحویل ثبت کنید'
          }
        />
      ) : (
        <div className="space-y-3">
          {pickups.map((pickup) => {
            const cancelled = pickup.status === 'CANCELLED';
            const delivered = pickup.status === 'DELIVERED';
            const active = !cancelled && !delivered;
            const progress =
              pickup.status === 'READY' ? 75 : pickup.status === 'PREPARING' ? 50 : 25;
            const deliveredAt = pickupStepTimestamps(pickup).DELIVERED;
            const cancellation = `لغو شده توسط ${pickupCancelActorName(pickup.cancelledByKind, 'portal')}${pickup.cancelReason ? ` - ${pickup.cancelReason}` : ''}`;
            return (
              <article
                key={pickup.id}
                aria-label={`درخواست ${toPersianDigits(pickup.pickupNumber)}`}
                className={cn(
                  'grid items-center gap-4 rounded-2xl border p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:gap-6',
                  active
                    ? 'border-amber-300/80 bg-white'
                    : cancelled
                      ? 'border-slate-200 bg-slate-50'
                      : 'border-slate-200 bg-white',
                )}
              >
                <div className="min-w-0 space-y-1 lg:col-start-3 lg:row-start-1 lg:min-w-52">
                  <p
                    className={cn(
                      'w-fit font-semibold tabular-nums',
                      cancelled && 'text-slate-500',
                    )}
                    dir="ltr"
                  >
                    {toPersianDigits(pickup.pickupNumber)}
                  </p>
                  <time dateTime={pickup.requestedAt} className="block text-xs text-slate-500">
                    {formatDate(pickup.requestedAt)}
                  </time>
                  <p className="text-sm leading-6">
                    {grams(pickup.weightGrams)} طلای آب‌شده عیار{' '}
                    {numberFormat.format(Number(pickup.purityRatio) * 1000)}
                  </p>
                </div>
                <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:border-x lg:border-slate-100 lg:px-6">
                  {active ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-amber-800">
                        {PICKUP_STATUS_LABELS[pickup.status]}
                      </p>
                      <div
                        role="progressbar"
                        aria-label="پیشرفت تحویل حضوری"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress}
                        aria-valuetext={PICKUP_STATUS_LABELS[pickup.status]}
                        className="h-1.5 overflow-hidden rounded-full bg-slate-100"
                      >
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : delivered ? (
                    <p className="flex items-center gap-2 text-sm leading-6 text-slate-600">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                      {deliveredAt
                        ? `تحویل نهایی شده در ${formatDate(deliveredAt)}`
                        : 'تحویل نهایی شده'}
                    </p>
                  ) : (
                    <p
                      title={cancellation}
                      className="flex min-w-0 items-center gap-2 text-sm text-slate-500"
                    >
                      <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{cancellation}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 lg:col-start-1 lg:row-start-1 lg:flex-col lg:items-start">
                  <span
                    className={cn(
                      'inline-flex rounded-full px-3 py-1 text-xs font-medium',
                      active
                        ? 'bg-emerald-50 text-emerald-700'
                        : delivered
                          ? 'bg-teal-50 text-teal-700'
                          : 'bg-slate-200/70 text-slate-600',
                    )}
                  >
                    {active ? 'در حال پردازش' : delivered ? 'تحویل‌شده' : 'لغو شده'}
                  </span>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className={cn(
                      'rounded-lg',
                      active
                        ? 'border-amber-800/50 text-amber-900 hover:bg-amber-50'
                        : 'border-slate-200 text-slate-600',
                    )}
                  >
                    <Link href={`/portal/pickups/${pickup.id}`}>
                      {active
                        ? 'مشاهده جزئیات و کد تحویل'
                        : delivered
                          ? 'مشاهده رسید'
                          : 'مشاهده جزئیات'}
                    </Link>
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <NewPickupModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}
