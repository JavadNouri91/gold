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
import { ORDER_STATUS_LABELS, formatDateTime, formatMoney, statusLabel } from '@/lib/utils';

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
        <Card>
          <CardHeader><CardTitle>خلاصه</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusBadge status={order.data.status} label={statusLabel(ORDER_STATUS_LABELS, order.data.status)} />
            <p>مبلغ: {formatMoney(order.data.totalAmountRial)}</p>
            <p>اعتبار رزروشده: {formatMoney(order.data.reservedAmountRial)}</p>
            <p>شناسه محاسبه قیمت: <span dir="ltr">{order.data.pricingCalculationId ?? '—'}</span></p>
            <p>{formatDateTime(order.data.createdAt)}</p>
            <Link className="text-gold-800" href={`/dashboard/customers/${order.data.customerId}`}>مشتری</Link>
          </CardContent>
        </Card>
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
