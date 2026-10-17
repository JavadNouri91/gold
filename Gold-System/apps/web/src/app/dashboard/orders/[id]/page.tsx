'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { assignmentsApi, internalOrdersApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { ReviewContextPanel } from '@/components/dashboard/review-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  feeLineLabel,
  formatDateTime,
  formatMoney,
  formatPurity,
  formatWeight,
  orderStatusPresentation,
} from '@/lib/utils';

export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'order.read');
  const canReview = hasPermission(user?.permissions, 'trade.review');
  const order = useSWR(canRead ? ['order', params.id] : null, () => internalOrdersApi.getById(params.id));
  const quotations = useSWR(
    hasPermission(user?.permissions, 'quotation.read') ? ['order-quotes', params.id] : null,
    () => internalOrdersApi.quotations(params.id),
  );
  const context = useSWR(canReview ? ['review', params.id] : null, () =>
    assignmentsApi.reviewContext(params.id),
  );

  if (!canRead && !canReview) return <ForbiddenNotice permission="order.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="جزئیات سفارش" description={order.data?.orderNumber} />
      {order.error ? <ApiErrorState error={order.error} onRetry={() => void order.mutate()} /> : null}
      {order.data ? (
        <>
          <Card>
            <CardHeader><CardTitle>خلاصه</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <StatusBadge {...orderStatusPresentation(order.data.status)} />
              <p>وزن: {formatWeight(order.data.weightGrams)}</p>
              <p>عیار: {formatPurity(order.data.purityRatio)}</p>
              <p>اعتبار رزروشده: {formatMoney(order.data.reservedAmountRial)}</p>
              <p>{formatDateTime(order.data.createdAt)}</p>
              <Link className="text-gold-800" href={`/dashboard/customers/${order.data.customerId}`}>مشتری</Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>جزئیات قیمت ثبت سفارش</CardTitle></CardHeader>
            <CardContent>
              <OrderPriceBreakdown
                step1BasePrice={order.data.step1BasePrice}
                wageAmount={order.data.wageAmount}
                feeAmountRial={order.data.feeAmountRial}
                totalAmountRial={order.data.totalAmountRial}
                charges={order.data.charges}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
      <Card>
        <CardHeader><CardTitle>پیش‌فاکتورها</CardTitle></CardHeader>
        <CardContent>
          {quotations.error ? <ApiErrorState error={quotations.error} /> : null}
          <ul className="divide-y text-sm">
            {(quotations.data ?? []).map((quote) => (
              <li key={quote.id} className="py-2">
                <Link href={`/dashboard/quotations/${quote.id}`} dir="ltr">{quote.quotationNumber}</Link>
                <span className="mr-3">{formatMoney(quote.totalAmountRial)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {context.error ? <ApiErrorState error={context.error} /> : null}
      {context.data ? (
        <ReviewContextPanel
          context={context.data}
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
    <dl className="divide-y divide-border text-sm">
      <DetailRow
        label="قیمت لحظه‌ای ثبت سفارش"
        value={`${formatMoney(step1BasePrice)} / گرم`}
      />
      {lines.length > 0 ? (
        lines.map((charge) => (
          <DetailRow
            key={`${charge.code}-${charge.side}`}
            label={feeLineLabel(charge.labelFa, charge.mode, charge.rateValue)}
            value={formatMoney(charge.amount)}
          />
        ))
      ) : (
        <DetailRow label="کارمزد" value={formatMoney(feeAmountRial ?? '0')} />
      )}
      <DetailRow label="اجرت" value={formatMoney(wageAmount ?? '0')} />
      <DetailRow label="جمع کل" value={formatMoney(totalAmountRial)} />
    </dl>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums font-medium">{value}</dd>
    </div>
  );
}
