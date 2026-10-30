'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  Calendar,
  Coins,
  Gem,
  Receipt,
  Scale,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react';
import { type PhysicalGoldPickup } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MobileNumber } from '@/components/ui/mobile-input';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PICKUP_FEE_STATUS_LABELS,
  PICKUP_RESERVATION_STATE_LABELS,
  pickupReservationState,
} from '@/lib/pickup-workflow';
import {
  PICKUP_STATUS_LABELS,
  cn,
  formatDate,
  formatDateTime,
  formatFeeRate,
  formatPurity,
  formatWeight,
  formatWholeMoney,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export function pickupCustomerName(pickup: PhysicalGoldPickup): string | null {
  return pickup.customer
    ? `${pickup.customer.firstName} ${pickup.customer.lastName}`.trim()
    : null;
}

// ─── Row / metric primitives ──────────────────────────────────────────────────

export function DetailRow({
  label,
  value,
  emphasize,
  className,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
  /** Extra classes, e.g. `print:hidden` for screen-only facts. */
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        emphasize && 'print-doc-total -mx-4 mt-1 rounded-lg bg-gold-50 px-4 text-gold-900',
        className,
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words text-left font-medium tabular-nums', emphasize && 'font-bold')}>
        {value}
      </dd>
    </div>
  );
}

export const METRIC_TONES = {
  gold: 'bg-gold-50 text-gold-700',
  blue: 'bg-sky-50 text-sky-700',
  amber: 'bg-amber-50 text-amber-700',
  slate: 'bg-slate-50 text-slate-600',
  green: 'bg-emerald-50 text-emerald-700',
} as const;

export function MetricCell({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Scale;
  tone: keyof typeof METRIC_TONES;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b lg:border-b-0 lg:border-s lg:first:border-s-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold tabular-nums md:text-base">{value}</p>
      </div>
      <span
        className={cn(
          'print-doc-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          METRIC_TONES[tone],
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}

/** 4-up KPI strip: weight, purity, conversion fee, gold price per gram. */
export function PickupMetricStrip({ pickup }: { pickup: PhysicalGoldPickup }) {
  const hasFee = !!pickup.fee && pickup.fee.mode !== 'NONE';
  return (
    <Card className="print-doc-card">
      <CardContent
        className="print-doc-metrics grid grid-cols-1 gap-0 p-0 sm:grid-cols-2 lg:grid-cols-4"
        data-kpi="4"
      >
        <MetricCell label="وزن" value={formatWeight(pickup.weightGrams)} icon={Scale} tone="blue" />
        <MetricCell label="عیار" value={formatPurity(pickup.purityRatio)} icon={Gem} tone="amber" />
        <MetricCell
          label="کارمزد تبدیل"
          value={hasFee ? formatWholeMoney(pickup.fee?.amountRial) : '—'}
          icon={Wallet}
          tone="gold"
        />
        <MetricCell
          label="قیمت هر گرم"
          value={formatWholeMoney(pickup.goldPricePerGramRial ?? pickup.fee?.goldPricePerGramRial)}
          icon={Coins}
          tone="slate"
        />
      </CardContent>
    </Card>
  );
}

// ─── Summary card (customer + order) ──────────────────────────────────────────

export function PickupSummaryCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  const customerName = pickupCustomerName(pickup);
  const customer = pickup.customer;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">مشتری و خلاصه سفارش</CardTitle>
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <SummaryField
            label="نام مشتری"
            value={
              customerName ? (
                <Link
                  href={`/dashboard/customers/${pickup.customerId}`}
                  className="font-medium text-gold-800 hover:underline"
                >
                  {customerName}
                </Link>
              ) : (
                <Link
                  href={`/dashboard/customers/${pickup.customerId}`}
                  className="font-medium text-gold-800 hover:underline"
                >
                  پرونده مشتری
                </Link>
              )
            }
          />
          <SummaryField
            label="شماره تماس"
            value={customer?.mobile ? <MobileNumber value={customer.mobile} /> : '—'}
          />
          {customer?.customerNumber ? (
            <SummaryField
              label="کد مشتری"
              value={
                <span dir="ltr" className="tabular-nums">
                  {toPersianDigits(customer.customerNumber)}
                </span>
              }
            />
          ) : null}
          <SummaryField label="تاریخ ثبت" value={formatDateTime(pickup.requestedAt)} />
          <SummaryField label="نوع تحویل" value="تحویل حضوری در فروشگاه" />
          <SummaryField
            label="زمان تحویل برنامه‌ریزی‌شده"
            value={pickup.scheduledPickupAt ? formatDate(pickup.scheduledPickupAt) : '—'}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function SummaryField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

// ─── Gold & order details ─────────────────────────────────────────────────────

export function PickupGoldCard({
  pickup,
  showTimeline = true,
}: {
  pickup: PhysicalGoldPickup;
  /** The printed receipt already lists the dates, so it hides the timeline. */
  showTimeline?: boolean;
}) {
  const fee = pickup.fee;
  return (
    <Card className="print-doc-card flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">اطلاعات طلا و سفارش</CardTitle>
        <Scale className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4 pt-0">
        {showTimeline ? (
          <PickupTimeline events={pickup.events} className="mb-3 border-b pb-3" />
        ) : null}
        <dl className="divide-y divide-border text-sm">
          <DetailRow label="وزن طلا" value={formatWeight(pickup.weightGrams)} />
          <DetailRow label="عیار" value={formatPurity(pickup.purityRatio)} />
          <DetailRow
            label="قیمت هر گرم"
            value={formatWholeMoney(pickup.goldPricePerGramRial ?? fee?.goldPricePerGramRial)}
          />
          {fee && fee.mode === 'PERCENTAGE' ? (
            <DetailRow
              label="ارزش طلا"
              value={formatWholeMoney(fee.baseAmountRial)}
            />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * Compact status timeline shown at the top of the gold card. Each entry is the
 * recorded status label plus its timestamp — read-only, straight from the API.
 */
export function PickupTimeline({
  events,
  className,
}: {
  events: PhysicalGoldPickup['events'];
  className?: string;
}) {
  if (events.length === 0) return null;
  return (
    <section aria-label="زمان‌بندی" className={cn('space-y-2', className)}>
      <p className="text-xs font-semibold text-muted-foreground">زمان‌بندی</p>
      <ol className="space-y-1.5">
        {events.map((event) => (
          <li key={event.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" aria-hidden />
              <span className="truncate font-medium">
                {statusLabel(PICKUP_STATUS_LABELS, event.status)}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatDateTime(event.createdAt)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── Financial & reservation status ───────────────────────────────────────────

export function PickupFinancialCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  const fee = pickup.fee;
  const hasFee = !!fee && fee.mode !== 'NONE';
  const rateText = fee ? formatFeeRate(fee.mode, fee.rateValue) : null;
  const reservation = pickupReservationState(pickup.status);
  return (
    <Card className="print-doc-card flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">وضعیت مالی و رزرو</CardTitle>
        <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          <DetailRow
            label="وضعیت رزرو طلا"
            value={
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  reservation === 'delivered'
                    ? 'text-emerald-700'
                    : reservation === 'released'
                      ? 'text-slate-500'
                      : 'text-gold-800',
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                {PICKUP_RESERVATION_STATE_LABELS[reservation]}
              </span>
            }
          />
          <DetailRow
            label="نوع کارمزد"
            value={rateText ?? (fee?.labelFa || 'بدون کارمزد')}
          />
          <DetailRow label="وضعیت کارمزد" value={PICKUP_FEE_STATUS_LABELS[fee?.status ?? 'NONE']} />
          <DetailRow
            label="مبلغ نهایی کارمزد"
            value={hasFee ? formatWholeMoney(fee?.amountRial) : '—'}
            emphasize={hasFee}
          />
          {fee?.walletAvailableAfterRial ? (
            <DetailRow
              label="موجودی کیف پول پس از رزرو"
              value={formatWholeMoney(fee.walletAvailableAfterRial)}
              className="print:hidden"
            />
          ) : null}
        </dl>
        <p className="mt-3 rounded-lg bg-gold-50 p-2 text-xs leading-6 text-gold-900 print:hidden">
          بهای طلا در معامله خرید قبلی تسویه شده؛ این بخش فقط کارمزد تبدیل/تحویل را نشان می‌دهد.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Print-view cards (reused by PickupDetails) ───────────────────────────────

export function PickupCustomerCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  const customerName = pickupCustomerName(pickup);
  const customer = pickup.customer;
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">اطلاعات مشتری</CardTitle>
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          <DetailRow
            label="نام مشتری"
            value={
              customerName ? (
                <Link
                  href={`/dashboard/customers/${pickup.customerId}`}
                  className="font-medium text-gold-800"
                >
                  {customerName}
                </Link>
              ) : (
                <Link
                  href={`/dashboard/customers/${pickup.customerId}`}
                  className="font-medium text-gold-800"
                >
                  پرونده مشتری
                </Link>
              )
            }
          />
          <DetailRow
            label="کد مشتری"
            value={
              customer?.customerNumber ? (
                <span dir="ltr" className="tabular-nums">
                  {toPersianDigits(customer.customerNumber)}
                </span>
              ) : (
                '—'
              )
            }
          />
          <DetailRow
            label="موبایل"
            value={customer?.mobile ? <MobileNumber value={customer.mobile} /> : '—'}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

export function PickupRequestCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">اطلاعات درخواست</CardTitle>
        <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          <DetailRow
            label="شماره درخواست"
            value={
              <span dir="ltr" className="font-medium tabular-nums">
                {toPersianDigits(pickup.pickupNumber)}
              </span>
            }
          />
          <DetailRow
            label="وضعیت"
            value={
              <StatusBadge
                status={pickup.status}
                label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
              />
            }
          />
          <DetailRow label="تاریخ ثبت" value={formatDateTime(pickup.requestedAt)} />
          <DetailRow
            label="زمان تحویل حضوری"
            value={pickup.scheduledPickupAt ? formatDate(pickup.scheduledPickupAt) : '—'}
          />
          <DetailRow
            label="تحویل شده در"
            value={pickup.deliveredAt ? formatDateTime(pickup.deliveredAt) : '—'}
          />
          <DetailRow label="آخرین به‌روزرسانی" value={formatDateTime(pickup.updatedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function PickupFeeCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  const fee = pickup.fee;
  const hasFee = !!fee && fee.mode !== 'NONE';
  const rateText = fee ? formatFeeRate(fee.mode, fee.rateValue) : null;
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">کارمزد تبدیل به فیزیکی</CardTitle>
        <Receipt className="h-4 w-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          <DetailRow label="نوع کارمزد" value={rateText ?? (fee?.labelFa || '—')} />
          <DetailRow label="وضعیت کارمزد" value={PICKUP_FEE_STATUS_LABELS[fee?.status ?? 'NONE']} />
          <DetailRow
            label="مبلغ کارمزد"
            value={hasFee ? formatWholeMoney(fee?.amountRial) : '—'}
            emphasize
          />
          {fee?.walletAvailableAfterRial ? (
            <DetailRow
              label="موجودی کیف پول پس از رزرو"
              value={formatWholeMoney(fee.walletAvailableAfterRial)}
              className="print:hidden"
            />
          ) : null}
        </dl>
        <p className="mt-3 rounded-lg bg-gold-50 p-2 text-xs leading-6 text-gold-900">
          بهای طلا در معامله خرید قبلی تسویه شده؛ این سند فقط کارمزد تبدیل/تحویل است.
        </p>
      </CardContent>
    </Card>
  );
}

export function PickupNotesCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  if (!pickup.staffNote && !pickup.customerNote) return null;
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">یادداشت‌ها</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          {pickup.customerNote ? (
            <DetailRow label="یادداشت مشتری" value={pickup.customerNote} />
          ) : null}
          {pickup.staffNote ? (
            <DetailRow label="یادداشت کارمند" value={pickup.staffNote} />
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

export function PickupCancelledCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  if (pickup.status !== 'CANCELLED') return null;
  const cancelActor = pickup.cancelledByKind === 'CUSTOMER' ? 'مشتری' : 'کارمند';
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">لغو درخواست</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          <DetailRow label="لغوکننده" value={cancelActor} />
          <DetailRow
            label="تاریخ لغو"
            value={pickup.cancelledAt ? formatDateTime(pickup.cancelledAt) : '—'}
          />
          <DetailRow label="دلیل لغو" value={pickup.cancelReason ?? '—'} />
        </dl>
      </CardContent>
    </Card>
  );
}

export function PickupHistoryCard({ pickup }: { pickup: PhysicalGoldPickup }) {
  if (pickup.events.length === 0) return null;
  return (
    <Card className="print-doc-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-base">زمان‌بندی</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <dl className="divide-y divide-border text-sm">
          {pickup.events.map((event) => (
            <DetailRow
              key={event.id}
              label={statusLabel(PICKUP_STATUS_LABELS, event.status)}
              value={formatDateTime(event.createdAt)}
            />
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
