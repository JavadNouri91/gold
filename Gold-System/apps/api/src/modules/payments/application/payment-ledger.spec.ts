import { customerLedgerWhere, foldPaymentSummary, readPaymentSide } from './payment-ledger';

describe('payment ledger', () => {
  const bounds = {
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-01-31T00:00:00.000Z'),
  };

  it('includes a customer receipt that is still waiting for confirmation', () => {
    const where = customerLedgerWhere('cust-real', bounds);
    expect(JSON.stringify(where)).not.toContain('"not":"PENDING"');
    expect(where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([{ customerId: 'cust-real' }]),
      }),
    );
  });

  it('keeps summary cards off the status chip', () => {
    const listed = customerLedgerWhere('cust-real', { ...bounds, statusGroup: 'failed' });
    const summary = customerLedgerWhere(
      'cust-real',
      { ...bounds, statusGroup: 'failed' },
      {
        ignoreStatusGroup: true,
      },
    );
    expect(JSON.stringify(listed)).toContain('FAILED');
    expect(JSON.stringify(summary)).not.toContain('"not":"PENDING"');
  });

  it('adds each successful status into one decimal total', () => {
    const summary = foldPaymentSummary(
      [
        { status: 'VALIDATED', direction: 'DEPOSIT', count: 1, amount: '0.10' },
        { status: 'ALLOCATED', direction: 'DEPOSIT', count: 1, amount: '0.20' },
        { status: 'COMPLETED', direction: 'DEPOSIT', count: 1, amount: '0.30' },
        { status: 'FAILED', direction: 'DEPOSIT', count: 2, amount: '1.00' },
        { status: 'REVERSED', direction: 'DEPOSIT', count: 1, amount: '4.00' },
        { status: 'PENDING', direction: 'DEPOSIT', count: 8, amount: '100.00' },
      ],
      true,
    );
    expect(summary.successful.amountRial).toBe('0.60');
    expect(summary.successful.count).toBe(3);
    expect(summary.totalPaid.amountRial).toBe('1.60');
    expect(summary.totalPaid.count).toBe(5);
    expect(summary.reversed.amountRial).toBe('4.00');
    expect(summary.submitted.amountRial).toBe('100.00');
    expect(summary.submitted.count).toBe(8);
  });

  it('separates withdrawals into withdrawn and pendingWithdrawal buckets', () => {
    const summary = foldPaymentSummary(
      [
        { status: 'VALIDATED', direction: 'WITHDRAWAL', count: 2, amount: '30.00' },
        { status: 'PENDING', direction: 'WITHDRAWAL', count: 1, amount: '10.00' },
        { status: 'FAILED', direction: 'WITHDRAWAL', count: 1, amount: '5.00' },
        { status: 'PENDING', direction: 'DEPOSIT', count: 3, amount: '9.00' },
      ],
      true,
    );
    expect(summary.withdrawn.amountRial).toBe('30.00');
    expect(summary.withdrawn.count).toBe(2);
    expect(summary.pendingWithdrawal.amountRial).toBe('10.00');
    expect(summary.pendingWithdrawal.count).toBe(1);
    // failed withdrawals are not counted anywhere
    expect(summary.failed.amountRial).toBe('0.00');
    expect(summary.submitted.amountRial).toBe('9.00');
  });

  it('filters the customer ledger by direction', () => {
    const where = customerLedgerWhere('cust-real', { ...bounds, direction: 'WITHDRAWAL' });
    expect(JSON.stringify(where)).toContain('"direction":"WITHDRAWAL"');
  });

  it('searches payment, reference, order, and trade numbers', () => {
    const where = customerLedgerWhere('cust-real', { ...bounds, q: 'ORD-9' });
    const serialized = JSON.stringify(where);
    expect(serialized).toContain('referenceNumber');
    expect(serialized).toContain('orderNumber');
    expect(serialized).toContain('tradeNumber');
    expect(serialized).toContain('ORD-9');
  });

  it('treats deposits without a trade as OTHER', () => {
    const where = customerLedgerWhere('cust-real', { ...bounds, type: 'OTHER' });
    expect(JSON.stringify(where)).toContain('"tradeId":null');
  });

  it('reads only BUY and SELL sides', () => {
    expect(readPaymentSide({ side: 'BUY' })).toBe('BUY');
    expect(readPaymentSide({ side: 'SELL' })).toBe('SELL');
    expect(readPaymentSide({ side: 'CREDIT' })).toBeNull();
    expect(readPaymentSide(null)).toBeNull();
  });
});
