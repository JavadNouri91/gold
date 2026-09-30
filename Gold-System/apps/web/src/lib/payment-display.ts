import type { PaymentLedgerType, PaymentStatusGroup } from './api';

const SUCCESSFUL = new Set(['VALIDATED', 'ALLOCATED', 'COMPLETED']);

export type PaymentTone = 'green' | 'red' | 'blue' | 'orange' | 'muted';

export function paymentTone(status: string): PaymentTone {
  if (SUCCESSFUL.has(status)) return 'green';
  if (status === 'FAILED') return 'red';
  if (status === 'REVERSED') return 'blue';
  if (status === 'PENDING') return 'orange';
  return 'muted';
}

/** Receipts waiting for the accountant use «در انتظار تأیید», not a pay-now state. */
export function paymentStatusLabel(status: string): string {
  if (SUCCESSFUL.has(status)) return 'موفق';
  if (status === 'FAILED') return 'ناموفق';
  if (status === 'REVERSED') return 'مسترد شده';
  if (status === 'PENDING') return 'در انتظار تأیید';
  if (status === 'CANCELLED') return 'لغو شده';
  return 'ثبت‌شده';
}

export function paymentTypeLabel(side: 'BUY' | 'SELL' | null | undefined): string {
  if (side === 'BUY') return 'پرداخت سفارش خرید';
  if (side === 'SELL') return 'پرداخت سفارش فروش';
  return 'سایر';
}

export const PAYMENT_STATUS_FILTERS: { id: '' | PaymentStatusGroup; label: string }[] = [
  { id: '', label: 'همه وضعیت‌ها' },
  { id: 'successful', label: 'موفق' },
  { id: 'failed', label: 'ناموفق' },
  { id: 'reversed', label: 'مسترد شده' },
  { id: 'submitted', label: 'در انتظار تأیید' },
];

export const PAYMENT_STATUS_CHIPS: { id: '' | PaymentStatusGroup; label: string }[] = [
  { id: '', label: 'همه' },
  { id: 'successful', label: 'موفق' },
  { id: 'failed', label: 'ناموفق' },
  { id: 'reversed', label: 'مسترد شده' },
  { id: 'submitted', label: 'در انتظار تأیید' },
];

export const PAYMENT_TYPE_FILTERS: { id: '' | PaymentLedgerType; label: string }[] = [
  { id: '', label: 'همه انواع' },
  { id: 'BUY', label: 'پرداخت سفارش خرید' },
  { id: 'SELL', label: 'پرداخت سفارش فروش' },
  { id: 'OTHER', label: 'سایر' },
];

export function paymentStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('fa-IR');
  const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `${day} - ${time}`;
}

export function relatedPaymentLabel(payment: {
  orderNumber?: string | null;
  tradeNumber?: string | null;
}): string {
  return payment.orderNumber || payment.tradeNumber || '—';
}
