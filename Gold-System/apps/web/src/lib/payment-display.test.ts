import {
  paymentStatusLabel,
  paymentTone,
  paymentTypeLabel,
  relatedPaymentLabel,
} from './payment-display';

describe('payment display', () => {
  it('groups real payment statuses without a pending label', () => {
    expect(paymentStatusLabel('COMPLETED')).toBe('موفق');
    expect(paymentStatusLabel('VALIDATED')).toBe('موفق');
    expect(paymentStatusLabel('ALLOCATED')).toBe('موفق');
    expect(paymentStatusLabel('FAILED')).toBe('ناموفق');
    expect(paymentStatusLabel('REVERSED')).toBe('مسترد شده');
    expect(paymentTone('REVERSED')).toBe('blue');
    expect(paymentStatusLabel('PENDING')).not.toContain('انتظار');
  });

  it('labels only supported payment types', () => {
    expect(paymentTypeLabel('BUY')).toBe('پرداخت سفارش خرید');
    expect(paymentTypeLabel('SELL')).toBe('پرداخت سفارش فروش');
    expect(paymentTypeLabel(null)).toBe('سایر');
  });

  it('prefers the order number and falls back to the trade number', () => {
    expect(relatedPaymentLabel({ orderNumber: 'ORD-1', tradeNumber: 'TR-1' })).toBe('ORD-1');
    expect(relatedPaymentLabel({ orderNumber: null, tradeNumber: 'TR-1' })).toBe('TR-1');
  });
});
