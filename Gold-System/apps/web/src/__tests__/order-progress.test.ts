import { orderProgress } from '@/lib/order-progress';

describe('orderProgress', () => {
  it('keeps a quoted buy in the goldsmith-review remaining step', () => {
    const progress = orderProgress('QUOTED');
    expect(progress.currentIndex).toBe(2);
    expect(progress.remainingLabel).toBe('در انتظار بررسی طلافروش.');
    expect(progress.terminal).toBeNull();
  });

  it('marks approved orders as waiting for trade creation', () => {
    expect(orderProgress('APPROVED').remainingLabel).toBe(
      'سفارش تأیید شد؛ در انتظار ایجاد معامله.',
    );
  });

  it('closes the remaining path after rejection', () => {
    expect(orderProgress('REJECTED').terminal).toBe('rejected');
  });

  it.each(['TRADE_CREATED', 'SETTLING', 'COMPLETED'])(
    'treats %s as an executed order with no settlement wait',
    (status) => {
      const progress = orderProgress(status);
      expect(progress.terminal).toBe('completed');
      expect(progress.remainingLabel).toBeNull();
      expect(progress.currentIndex).toBe(5);
    },
  );
});
