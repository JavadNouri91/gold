'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR, { useSWRConfig } from 'swr';
import { ordersApi, ApiClientError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  formatRial,
  formatGrams,
  formatDate,
  formatDateTime,
  formatPurity,
  formatMoney,
  formatWeight,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  SETTLEMENT_STATUS_LABELS,
} from '@/lib/utils';

// Statuses where customer can cancel
const CANCELLABLE = ['DRAFT', 'SUBMITTED', 'QUOTED', 'ASSIGNED', 'UNDER_REVIEW'];

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { data: order, error, isLoading } = useSWR(
    `orders/${params.id}`,
    () => ordersApi.getById(params.id),
  );

  const { data: quotations } = useSWR(
    order ? `orders/${params.id}/quotations` : null,
    () => ordersApi.getQuotations(params.id),
  );

  const { data: activity } = useSWR(
    order ? `orders/${params.id}/activity` : null,
    () => ordersApi.activityDetail(params.id),
  );

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      setCancelError('لطفاً دلیل لغو را وارد کنید');
      return;
    }
    setCancelError(null);
    setIsCancelling(true);
    try {
      await ordersApi.cancel(params.id, cancelReason);
      await mutate(`orders/${params.id}`);
      setCancelOpen(false);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setCancelError(err.message);
      } else {
        setCancelError('خطا در لغو سفارش');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) return <PageSpinner />;
  if (error) return <Alert variant="error">خطا در بارگذاری سفارش</Alert>;
  if (!order) return null;

  const canCancel = CANCELLABLE.includes(order.status);

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => router.back()}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              ← بازگشت
            </button>
          </div>
          <h1 className="text-2xl font-bold" dir="ltr">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
        </div>
        <StatusBadge
          status={order.status}
          label={ORDER_STATUS_LABELS[order.status] ?? order.status}
        />
      </div>

      {/* Details */}
      <Card>
        <CardHeader><CardTitle>جزئیات سفارش</CardTitle></CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            <DetailRow label="وزن" value={formatGrams(order.weightGrams)} />
            <DetailRow label="عیار" value={formatPurity(order.purityRatio)} />
            <DetailRow label="مبلغ کل" value={formatRial(order.totalAmountRial)} />
            <DetailRow label="رزرو شده" value={formatRial(order.reservedAmountRial)} />
            {order.submittedAt && (
              <DetailRow label="تاریخ ارسال" value={formatDate(order.submittedAt)} />
            )}
            {order.cancellationReason && (
              <DetailRow label="دلیل لغو" value={order.cancellationReason} />
            )}
            {order.cancelledAt && (
              <DetailRow label="تاریخ لغو" value={formatDate(order.cancelledAt)} />
            )}
          </dl>
        </CardContent>
      </Card>

      {activity ? (
        <Card>
          <CardHeader><CardTitle>جزئیات معامله</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              {activity.side ? (
                <DetailRow label="نوع معامله" value={activity.side === 'BUY' ? 'خرید' : 'فروش'} />
              ) : null}
              {activity.confirmedAt ? (
                <DetailRow label="تاریخ تأیید" value={formatDateTime(activity.confirmedAt)} />
              ) : null}
              {activity.unitPriceRial ? (
                <DetailRow label="قیمت واحد" value={`${formatMoney(activity.unitPriceRial)} / گرم`} />
              ) : null}
              {activity.wageAmount ? <DetailRow label="کارمزد" value={formatMoney(activity.wageAmount)} /> : null}
              {activity.taxAmount ? <DetailRow label="مالیات" value={formatMoney(activity.taxAmount)} /> : null}
              <DetailRow label="مبلغ نهایی" value={formatMoney(activity.totalAmountRial)} />
              <DetailRow label="وزن" value={formatWeight(activity.weightGrams)} />
              {activity.quotationNumber ? (
                <DetailRow label="شماره پیش‌فاکتور" value={activity.quotationNumber} />
              ) : null}
              {activity.tradeNumber ? (
                <DetailRow label="شماره معامله" value={activity.tradeNumber} />
              ) : null}
              {activity.paymentMethods.length > 0 ? (
                <DetailRow
                  label="روش پرداخت"
                  value={activity.paymentMethods.map((method) => PAYMENT_METHOD_LABELS[method] ?? method).join('، ')}
                />
              ) : null}
              {activity.reservedAmountRial ? (
                <DetailRow label="اعتبار رزروشده" value={formatMoney(activity.reservedAmountRial)} />
              ) : null}
              {activity.settlementStatus ? (
                <DetailRow
                  label="وضعیت تسویه"
                  value={SETTLEMENT_STATUS_LABELS[activity.settlementStatus] ?? activity.settlementStatus}
                />
              ) : null}
            </dl>
            {activity.tradeId ? (
              <Link href={`/portal/trades/${activity.tradeId}`} className="mt-3 inline-flex min-h-11 items-center text-sm text-gold-600">
                مشاهده معامله تأییدشده
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Quotations */}
      {quotations && quotations.length > 0 && (
        <Card>
          <CardHeader><CardTitle>پیشنهاد قیمت‌ها</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {quotations.map((q) => (
                <li key={q.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">نسخه {q.version}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(q.generatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={q.status} label={q.status} />
                    <Link href={`/portal/quotations/${q.id}`}>
                      <Button variant="outline" size="sm">مشاهده</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Cancel */}
      {canCancel && (
        <div className="pt-2">
          <Button
            variant="destructive"
            onClick={() => setCancelOpen(true)}
          >
            لغو سفارش
          </Button>
        </div>
      )}

      {/* Cancel modal */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCancelOpen(false)}
          />
          <div className="relative z-10 bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="font-semibold text-lg">لغو سفارش</h2>
            <p className="text-sm text-muted-foreground">
              با لغو سفارش، اعتبار رزرو شده (<span className="font-medium">{formatRial(order.reservedAmountRial)}</span>) آزاد خواهد شد.
            </p>
            {cancelError && <Alert variant="error">{cancelError}</Alert>}
            <div className="space-y-1">
              <label className="block text-sm font-medium">دلیل لغو</label>
              <textarea
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                placeholder="دلیل لغو سفارش را وارد کنید"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelOpen(false)}
                disabled={isCancelling}
              >
                انصراف
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                isLoading={isCancelling}
              >
                تأیید لغو
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
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
