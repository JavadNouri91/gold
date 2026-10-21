'use client';

import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Calendar, Check, ChevronDown, Copy, Gem, Scale, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { assignmentsApi, internalOrdersApi } from '@/lib/internal-api';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ReviewContextPanel } from '@/components/dashboard/review-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  CUSTOMER_ACCOUNT_STATUS_LABELS,
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  KYC_STATUS_LABELS,
  cn,
  feeLineLabel,
  formatDateTime,
  formatWholeMoney,
  formatPurity,
  formatWeight,
  orderStatusPresentation,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'order.read');
  const canReview = hasPermission(user?.permissions, 'trade.review');
  const order = useSWR(canRead ? ['order', params.id] : null, () => internalOrdersApi.getById(params.id));
  const context = useSWR(canReview ? ['review', params.id] : null, () =>
    assignmentsApi.reviewContext(params.id),
  );

  if (!canRead && !canReview) return <ForbiddenNotice permission="order.read" />;

  const row = order.data;
  const review = context.data;
  const orderNumber = row?.orderNumber ?? review?.order.orderNumber;
  const status = row?.status ?? review?.order.status;
  const totalAmount = row?.totalAmountRial ?? review?.order.totalAmountRial;
  const weight = row?.weightGrams ?? review?.order.weightGrams;
  const purity = row?.purityRatio ?? review?.order.purityRatio;
  const reserved = row?.reservedAmountRial ?? review?.order.reservedAmountRial;
  const createdAt = row?.createdAt ?? review?.order.createdAt;
  const loading = (canRead && !order.data && !order.error) || (canReview && !context.data && !context.error);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold md:text-2xl">جزئیات سفارش</h1>
          {orderNumber ? (
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="text-sm font-medium tabular-nums text-muted-foreground">
                {toPersianDigits(orderNumber)}
              </span>
              <CopyOrderNumber value={orderNumber} />
              {status ? <StatusBadge {...orderStatusPresentation(status)} /> : null}
            </div>
          ) : null}
        </div>
      </header>

      {order.error ? <ApiErrorState error={order.error} onRetry={() => void order.mutate()} /> : null}
      {context.error ? <ApiErrorState error={context.error} onRetry={() => void context.mutate()} /> : null}

      {loading ? <SkeletonBlock className="h-24" /> : null}

      {orderNumber ? (
        <Card>
          <CardContent className="grid grid-cols-1 gap-0 p-0 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCell
              label="مبلغ سفارش"
              value={formatWholeMoney(totalAmount)}
              icon={Wallet}
              tone="gold"
            />
            <MetricCell label="وزن" value={formatWeight(weight)} icon={Scale} tone="blue" />
            <MetricCell label="عیار" value={formatPurity(purity)} icon={Gem} tone="amber" />
            <MetricCell
              label="اعتبار رزروشده"
              value={formatWholeMoney(reserved)}
              icon={ShieldCheck}
              tone="green"
            />
            <MetricCell
              label="تاریخ ایجاد"
              value={formatDateTime(createdAt)}
              icon={Calendar}
              tone="slate"
            />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {row ? (
            <Card>
              <details open className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
                  <CardTitle className="text-base">جزئیات قیمت ثبت سفارش</CardTitle>
                  <ChevronDown
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <CardContent className="p-4 pt-0">
                  <OrderPriceBreakdown
                    step1BasePrice={row.step1BasePrice}
                    wageAmount={row.wageAmount}
                    feeAmountRial={row.feeAmountRial}
                    totalAmountRial={row.totalAmountRial}
                    charges={row.charges}
                  />
                </CardContent>
              </details>
            </Card>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {review?.customer || row ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 pb-2">
                <CardTitle className="text-base">اطلاعات مشتری</CardTitle>
                <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {review?.customer ? (
                  <dl className="divide-y divide-border text-sm">
                    <DetailRow
                      label="نام مشتری"
                      value={
                        <Link className="font-medium text-gold-800" href={`/dashboard/customers/${review.customer.id}`}>
                          {review.customer.firstName} {review.customer.lastName}
                        </Link>
                      }
                    />
                    <DetailRow
                      label="کد مشتری"
                      value={
                        <span dir="ltr" className="tabular-nums">
                          {toPersianDigits(review.customer.customerNumber)}
                        </span>
                      }
                    />
                    <DetailRow
                      label="نوع حساب"
                      value={statusLabel(CUSTOMER_TYPE_LABELS, review.customer.type)}
                    />
                    <DetailRow
                      label="وضعیت احراز هویت"
                      value={
                        <StatusBadge
                          status={review.customer.kycStatus ?? 'PENDING'}
                          label={statusLabel(KYC_STATUS_LABELS, review.customer.kycStatus)}
                        />
                      }
                    />
                    <DetailRow
                      label="وضعیت حساب"
                      value={
                        <StatusBadge
                          status={review.account?.status ?? review.customer.status}
                          label={statusLabel(
                            review.account ? CUSTOMER_ACCOUNT_STATUS_LABELS : CUSTOMER_STATUS_LABELS,
                            review.account?.status ?? review.customer.status,
                          )}
                        />
                      }
                    />
                  </dl>
                ) : row ? (
                  <Link className="text-sm font-medium text-gold-800" href={`/dashboard/customers/${row.customerId}`}>
                    مشاهده مشتری
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {review ? (
        <ReviewContextPanel
          context={review}
          onChanged={() => {
            void order.mutate();
            void context.mutate();
          }}
        />
      ) : null}
    </div>
  );
}

function OrderPriceBreakdown({
  step1BasePrice,
  wageAmount,
  feeAmountRial,
  totalAmountRial,
  charges,
}: {
  step1BasePrice?: string | null;
  wageAmount?: string | null;
  feeAmountRial?: string;
  totalAmountRial: string;
  charges?: Array<{
    code: string;
    labelFa: string;
    side: string;
    amount: string;
    mode?: string;
    rateValue?: string;
  }>;
}) {
  const lines = charges ?? [];
  return (
    <dl className="text-sm">
      <DetailRow label="قیمت هر گرم" value={`${formatWholeMoney(step1BasePrice)} / گرم`} />
      {lines.length > 0 ? (
        lines.map((charge) => (
          <DetailRow
            key={`${charge.code}-${charge.side}`}
            label={feeLineLabel(charge.labelFa, charge.mode, charge.rateValue)}
            value={formatWholeMoney(charge.amount)}
          />
        ))
      ) : (
        <DetailRow label="کارمزد خرید" value={formatWholeMoney(feeAmountRial ?? '0')} />
      )}
      <DetailRow label="اجرت" value={formatWholeMoney(wageAmount ?? '0')} />
      <DetailRow label="جمع کل" value={formatWholeMoney(totalAmountRial)} emphasize />
    </dl>
  );
}

function DetailRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 py-2.5',
        emphasize && '-mx-4 mt-1 rounded-lg bg-gold-50 px-4 text-gold-900',
      )}
    >
      <dt className={cn('shrink-0 text-muted-foreground', emphasize && 'font-medium text-gold-800')}>{label}</dt>
      <dd className={cn('min-w-0 break-words text-left font-medium tabular-nums', emphasize && 'text-base')}>
        {value}
      </dd>
    </div>
  );
}

function MetricCell({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: 'gold' | 'blue' | 'amber' | 'green' | 'slate';
}) {
  const tones = {
    gold: 'bg-gold-50 text-gold-700',
    blue: 'bg-sky-50 text-sky-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    slate: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0 sm:border-b lg:border-b-0 lg:border-s lg:first:border-s-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-words text-sm font-semibold tabular-nums md:text-base">{value}</p>
      </div>
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tones[tone])}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
    </div>
  );
}

function CopyOrderNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="کپی شماره سفارش"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore clipboard failures */
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
