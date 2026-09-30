'use client';

import Link from 'next/link';
import { CreditCard, ReceiptText } from 'lucide-react';
import { fetchBlob, type Payment } from '@/lib/api';
import { PaymentStatusBadge } from '@/components/portal/payments/my-payments-page';
import {
  paymentStamp,
  paymentTypeLabel,
  relatedPaymentLabel,
} from '@/lib/payment-display';
import { PAYMENT_METHOD_LABELS, formatMoney } from '@/lib/utils';

export function PaymentDetailView({ payment }: { payment: Payment }) {
  const related = relatedPaymentLabel(payment);
  const orderHref = payment.orderId ? `/portal/orders/${payment.orderId}` : null;
  const openReceipt = async () => {
    const blob = await fetchBlob(`/payments/${payment.id}/receipt`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-4 overflow-x-hidden">
      <header>
        <h1 className="text-xl font-bold text-[#202124] lg:text-2xl">جزئیات پرداخت</h1>
      </header>
      <dl className="divide-y divide-[#E5E7EB] rounded-2xl border border-[#E5E7EB] bg-white">
        <DetailRow label="شماره پرداخت" value={payment.id} ltr />
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <dt className="text-sm text-[#6B7280]">وضعیت</dt>
          <dd>
            <PaymentStatusBadge status={payment.status} />
          </dd>
        </div>
        <DetailRow label="مبلغ" value={formatMoney(payment.amount)} />
        <DetailRow label="نوع پرداخت" value={paymentTypeLabel(payment.relatedSide)} />
        <DetailRow label="شماره سفارش" value={related} ltr />
        <DetailRow label="روش پرداخت" value={PAYMENT_METHOD_LABELS[payment.method] ?? payment.method} />
        <DetailRow label="شماره پیگیری" value={payment.referenceNumber || '—'} ltr copyable={Boolean(payment.referenceNumber)} />
        <DetailRow label="تاریخ و ساعت" value={paymentStamp(payment.receivedAt || payment.createdAt)} />
      </dl>
      {payment.hasReceipt ? (
        <button
          type="button"
          onClick={() => void openReceipt().catch(() => undefined)}
          className="inline-flex min-h-11 items-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
        >
          مشاهده رسید
        </button>
      ) : null}
      {orderHref ? (
        <Link
          href={orderHref}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FFF4D6] px-4 text-sm font-bold text-[#C8922E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
        >
          <ReceiptText className="h-4 w-4" aria-hidden />
          مشاهده سفارش
        </Link>
      ) : (
        <Link
          href={`/portal/trades/${payment.tradeId}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#F8F9FA] px-4 text-sm font-semibold text-[#202124] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8922E]"
        >
          <CreditCard className="h-4 w-4" aria-hidden />
          مشاهده معامله مرتبط
        </Link>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  ltr,
  copyable,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <dt className="shrink-0 text-sm text-[#6B7280]">{label}</dt>
      <dd className="min-w-0 break-all text-left text-sm font-semibold text-[#202124]" dir={ltr ? 'ltr' : undefined}>
        {copyable ? (
          <span className="select-all">{value}</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
