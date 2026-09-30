'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalPaymentsApi, internalSettlementsApi, internalTradesApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { TradeApprovalPanel } from '@/components/dashboard/trade-panel';
import { SettlementSummary } from '@/components/dashboard/payment-panel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/portal/status-badge';
import { SETTLEMENT_STATUS_LABELS, TRADE_STATUS_LABELS, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function TradeDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.read', 'trade.approve']);
  const trade = useSWR(allowed ? ['trade', params.id] : null, () => internalTradesApi.getById(params.id));
  const payment = useSWR(
    trade.data && hasPermission(user?.permissions, 'payment.read') ? ['trade-pay', trade.data.id] : null,
    () => internalPaymentsApi.tradeStatus(params.id),
  );
  const settlement = useSWR(
    hasPermission(user?.permissions, 'settlement.read') ? ['trade-settle', params.id] : null,
    () => internalSettlementsApi.getByTrade(params.id),
  );

  if (!allowed) return <ForbiddenNotice permission="trade.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="جزئیات معامله" description={trade.data?.tradeNumber} />
      {trade.error ? <ApiErrorState error={trade.error} onRetry={() => void trade.mutate()} /> : null}
      {trade.data ? (
        <Card>
          <CardHeader><CardTitle>شرایط قفل‌شده</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <StatusBadge status={trade.data.status} label={statusLabel(TRADE_STATUS_LABELS, trade.data.status)} />
            <p>مبلغ {formatMoney(trade.data.totalAmountRial)}</p>
            <p>وزن {formatWeight(trade.data.weightGrams)}</p>
            <p>قیمت واحد <span dir="ltr">{trade.data.unitPriceRial}</span></p>
            <p>تأییدکننده <span dir="ltr">{trade.data.confirmedByUserId}</span></p>
            <p>دلیل برگشت: {trade.data.reversalReason ?? '—'}</p>
            <Link href={`/dashboard/customers/${trade.data.customerId}`}>مشتری</Link>
            <Link href={`/dashboard/orders/${trade.data.orderId}`}>سفارش</Link>
            <TradeApprovalPanel
              tradeId={trade.data.id}
              status={trade.data.status}
              onChanged={() => void trade.mutate()}
            />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>تسویه</CardTitle></CardHeader>
        <CardContent>
          {settlement.error ? <ApiErrorState error={settlement.error} /> : null}
          {settlement.data ? (
            <SettlementSummary
              total={payment.data?.tradeTotal ?? trade.data?.totalAmountRial}
              settled={settlement.data.settledAmount}
              status={statusLabel(SETTLEMENT_STATUS_LABELS, settlement.data.status)}
              settledAt={settlement.data.settledAt}
            />
          ) : (
            <p className="text-sm text-muted-foreground">سابقه تسویه از مجوز settlement.read خوانده می‌شود.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
