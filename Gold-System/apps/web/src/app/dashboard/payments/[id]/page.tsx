'use client';

import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalPaymentsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { PaymentActionPanel } from '@/components/dashboard/payment-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/portal/status-badge';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDateTime, formatMoney, statusLabel } from '@/lib/utils';

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'payment.read');
  const payment = useSWR(allowed ? ['payment', params.id] : null, () => internalPaymentsApi.getById(params.id));
  const status = useSWR(
    payment.data ? ['payment-trade', payment.data.tradeId] : null,
    () => internalPaymentsApi.tradeStatus(payment.data!.tradeId),
  );

  if (!allowed) return <ForbiddenNotice permission="payment.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="جزئیات پرداخت" />
      {payment.error ? <ApiErrorState error={payment.error} onRetry={() => void payment.mutate()} /> : null}
      {payment.data ? (
        <Card>
          <CardHeader><CardTitle>رسید</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>مبلغ {formatMoney(payment.data.amount)}</p>
            <p>روش {statusLabel(PAYMENT_METHOD_LABELS, payment.data.method)}</p>
            <p>ارجاع {payment.data.referenceNumber ?? '—'}</p>
            <p>{formatDateTime(payment.data.createdAt)}</p>
            <StatusBadge status={payment.data.status} label={statusLabel(PAYMENT_STATUS_LABELS, payment.data.status)} />
            <PaymentActionPanel
              payment={payment.data}
              status={status.data}
              onChanged={() => {
                void payment.mutate();
                void status.mutate();
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
