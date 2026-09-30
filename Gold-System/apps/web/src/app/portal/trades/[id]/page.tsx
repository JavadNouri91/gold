'use client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { tradesApi, paymentsApi, settlementsApi, ordersApi, quotationsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  formatRial,
  formatGrams,
  formatDate,
  formatDateTime,
  formatPurity,
  TRADE_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SETTLEMENT_STATUS_LABELS,
} from '@/lib/utils';

export default function TradeDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: trade, error, isLoading } = useSWR(
    `trades/${params.id}`,
    () => tradesApi.getById(params.id),
  );

  const { data: payments } = useSWR(
    trade ? `payments/trade/${params.id}` : null,
    () => paymentsApi.getByTrade(params.id),
  );

  const { data: settlement } = useSWR(
    trade ? `settlements/trade/${params.id}` : null,
    () => settlementsApi.getByTrade(params.id).catch(() => null),
  );

  const orderId = trade?.orderId;
  const { data: order } = useSWR(orderId ? `orders/${orderId}` : null, () => {
    if (!orderId) throw new Error('missing order');
    return ordersApi.getById(orderId);
  });

  const quotationId = trade?.quotationId;
  const { data: quotation } = useSWR(quotationId ? `quotations/${quotationId}` : null, () => {
    if (!quotationId) throw new Error('missing quotation');
    return quotationsApi.getById(quotationId);
  });

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert variant="error">خطا در بارگذاری معامله</Alert>;
  if (!trade) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" dir="ltr">{trade.tradeNumber}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(trade.confirmedAt ?? trade.createdAt)}</p>
        </div>
        <StatusBadge
          status={trade.status}
          label={TRADE_STATUS_LABELS[trade.status] ?? trade.status}
        />
      </div>

      {/* Trade terms */}
      <Card>
        <CardHeader><CardTitle>شرایط معامله</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            <Row label="شماره سفارش" value={order?.orderNumber ?? '—'} />
            <Row label="وزن" value={formatGrams(trade.weightGrams)} />
            <Row label="عیار" value={formatPurity(trade.purityRatio)} />
            <Row label="قیمت واحد" value={`${formatRial(trade.unitPriceRial)} / گرم`} />
            <Row label="تاریخ ثبت سفارش" value={order ? formatDateTime(order.createdAt) : '—'} />
            <Row label="تاریخ تأیید" value={formatDateTime(trade.confirmedAt)} />
            {trade.wageAmount && parseFloat(trade.wageAmount) !== 0 && (
              <Row label="اجرت ساخت" value={formatRial(trade.wageAmount)} />
            )}
            {trade.taxAmount && parseFloat(trade.taxAmount) !== 0 && (
              <Row label="مالیات" value={formatRial(trade.taxAmount)} />
            )}
            {trade.discountAmount && parseFloat(trade.discountAmount) !== 0 && (
              <Row label="تخفیف" value={`−${formatRial(trade.discountAmount)}`} />
            )}
            <Row label="مبلغ کل" value={formatRial(trade.totalAmountRial)} highlight />
            {order ? <Row label="اعتبار رزروشده" value={formatRial(order.reservedAmountRial)} /> : null}
            {quotation?.quotationNumber ? (
              <Row label="شماره پیش‌فاکتور" value={quotation.quotationNumber} />
            ) : null}
          </dl>
        </CardContent>
      </Card>

      {/* Settlement status */}
      {settlement && (
        <Card>
          <CardHeader><CardTitle>وضعیت تسویه</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <StatusBadge
                status={settlement.status}
                label={SETTLEMENT_STATUS_LABELS[settlement.status] ?? settlement.status}
              />
              <span className="text-sm font-medium">
                تسویه شده: {formatRial(settlement.settledAmount)} از {formatRial(trade.totalAmountRial)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payments */}
      {payments && payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>پرداخت‌های مرتبط</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</p>
                    {p.referenceNumber && (
                      <p className="text-xs text-muted-foreground" dir="ltr">{p.referenceNumber}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(p.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{formatRial(p.amount)}</span>
                    <StatusBadge
                      status={p.status}
                      label={PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Link href={`/portal/orders/${trade.orderId}`}>
          <button className="text-sm text-gold-600 hover:underline">مشاهده سفارش مرتبط</button>
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between py-2.5 ${highlight ? 'font-bold' : ''}`}>
      <dt className={highlight ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
