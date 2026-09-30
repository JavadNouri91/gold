import {
  computeCustomerActivity,
  readOrderSide,
  type ActivityOrderInput,
} from './customer-activity.math';

function row(overrides: Partial<ActivityOrderInput> = {}): ActivityOrderInput {
  return {
    id: overrides.id ?? 'ord-1',
    orderNumber: overrides.orderNumber ?? 'ORD-000001',
    status: overrides.status ?? 'COMPLETED',
    totalAmountRial: overrides.totalAmountRial ?? '1000.00',
    weightGrams: overrides.weightGrams ?? '10.000000',
    purityRatio: overrides.purityRatio ?? '0.750000',
    unitPriceRial: overrides.unitPriceRial ?? '100.000000',
    side: overrides.side === undefined ? 'BUY' : overrides.side,
    createdAt: overrides.createdAt ?? new Date('2026-09-15T08:00:00.000Z'),
    submittedAt: overrides.submittedAt ?? null,
    reservedAmountRial: overrides.reservedAmountRial ?? '0.00',
    trade: overrides.trade === undefined ? null : overrides.trade,
    quotationId: overrides.quotationId ?? null,
    quotationNumber: overrides.quotationNumber ?? null,
    paymentMethods: overrides.paymentMethods ?? [],
    settlementStatus: overrides.settlementStatus ?? null,
  };
}

describe('customer activity analytics', () => {
  const query = { bucket: 'month' as const, page: 1, limit: 10 };

  it('does not invent customer profit or loss', () => {
    const result = computeCustomerActivity(
      [
        row({ totalAmountRial: '5000.00' }),
        row({ id: '2', side: 'SELL', totalAmountRial: '1000.00' }),
      ],
      query,
    );
    expect(result.pnl).toEqual({
      supported: false,
      realizedRial: null,
      unrealizedRial: null,
      totalRial: null,
      changePercent: null,
    });
  });

  it('splits buy and sell only when a side was stored, and sums grams with Decimal', () => {
    const result = computeCustomerActivity(
      [
        row({ id: 'buy', side: 'BUY', weightGrams: '30.000000', totalAmountRial: '1750000000.00' }),
        row({
          id: 'sell',
          side: 'SELL',
          weightGrams: '10.000000',
          totalAmountRial: '587000000.00',
        }),
        row({ id: 'unknown', side: null, weightGrams: '2.500000', totalAmountRial: '10.00' }),
      ],
      query,
    );

    expect(result.buy).toEqual({ amountRial: '1750000000.00', grams: '30.000000', count: 1 });
    expect(result.sell).toEqual({ amountRial: '587000000.00', grams: '10.000000', count: 1 });
    expect(result.unclassified.grams).toBe('2.500000');
    expect(result.volume).toEqual({ grams: '42.500000', count: 3, unit: 'GRAM' });
    expect(result.distribution.segments.map((segment) => segment.id)).toEqual([
      'BUY',
      'SELL',
      'UNCLASSIFIED',
    ]);
  });

  it('keeps cancelled, rejected, reversed, and draft orders out of booked volume', () => {
    const result = computeCustomerActivity(
      [
        row({ id: 'ok', side: 'BUY', weightGrams: '5.000000' }),
        row({ id: 'cancelled', status: 'CANCELLED', weightGrams: '9.000000' }),
        row({ id: 'rejected', status: 'REJECTED', weightGrams: '8.000000' }),
        row({ id: 'draft', status: 'DRAFT', weightGrams: '7.000000' }),
        row({
          id: 'reversed',
          side: 'SELL',
          weightGrams: '4.000000',
          trade: {
            id: 'tr-1',
            tradeNumber: 'TRD-000001',
            status: 'REVERSED',
            totalAmountRial: '400.00',
            weightGrams: '4.000000',
            unitPriceRial: '100.000000',
            wageAmount: null,
            taxAmount: null,
            confirmedAt: '2026-09-15T08:00:00.000Z',
            quotationId: null,
          },
        }),
      ],
      query,
    );

    expect(result.volume).toEqual({ grams: '5.000000', count: 1, unit: 'GRAM' });
    expect(result.excludedCount).toBe(3);
    expect(result.meta.total).toBe(4);
    expect(result.transactions.map((item) => item.id)).toEqual([
      'ok',
      'cancelled',
      'rejected',
      'reversed',
    ]);
    expect(result.transactions.find((item) => item.id === 'cancelled')?.countsTowardVolume).toBe(
      false,
    );
    expect(result.transactions.find((item) => item.id === 'reversed')?.status).toBe('REVERSED');
  });

  it('counts an explicit cancelled filter instead of hiding it', () => {
    const result = computeCustomerActivity(
      [
        row({ id: 'ok', weightGrams: '5.000000' }),
        row({
          id: 'cancelled',
          status: 'CANCELLED',
          weightGrams: '9.000000',
          totalAmountRial: '90.00',
        }),
      ],
      { ...query, status: 'CANCELLED' },
    );

    expect(result.totalsBasis).toBe('status-filter');
    expect(result.volume.grams).toBe('9.000000');
    expect(result.meta.total).toBe(1);
    expect(result.transactions[0]?.countsTowardVolume).toBe(true);
  });

  it('filters by side, purity, and order number without dropping other customers data handling', () => {
    const rows = [
      row({ id: '1', orderNumber: 'ORD-000125', side: 'BUY', purityRatio: '0.750000' }),
      row({ id: '2', orderNumber: 'ORD-000124', side: 'SELL', purityRatio: '0.999000' }),
      row({
        id: '3',
        orderNumber: 'ORD-000100',
        side: 'BUY',
        purityRatio: '0.916000',
        trade: {
          id: 'tr',
          tradeNumber: 'TRD-000090',
          status: 'CONFIRMED',
          totalAmountRial: '10.00',
          weightGrams: '1.000000',
          unitPriceRial: '10.000000',
          wageAmount: null,
          taxAmount: null,
          confirmedAt: null,
          quotationId: null,
        },
      }),
    ];

    expect(
      computeCustomerActivity(rows, { ...query, side: 'SELL' }).transactions.map((item) => item.id),
    ).toEqual(['2']);
    expect(
      computeCustomerActivity(rows, { ...query, purityRatio: '0.75' }).transactions.map(
        (item) => item.id,
      ),
    ).toEqual(['1']);
    expect(
      computeCustomerActivity(rows, { ...query, q: 'trd-000090' }).transactions.map(
        (item) => item.id,
      ),
    ).toEqual(['3']);
    expect(computeCustomerActivity(rows, { ...query, q: '000125' }).meta.total).toBe(1);
  });

  it('uses the locked trade amount when a trade exists and paginates the list', () => {
    const rows = [
      row({
        id: '1',
        totalAmountRial: '1.00',
        weightGrams: '1.000000',
        trade: {
          id: 'tr',
          tradeNumber: 'TRD-000001',
          status: 'CONFIRMED',
          totalAmountRial: '250.50',
          weightGrams: '2.500000',
          unitPriceRial: '100.200000',
          wageAmount: '10.00',
          taxAmount: null,
          confirmedAt: '2026-09-16T10:00:00.000Z',
          quotationId: 'q-1',
        },
      }),
      row({ id: '2', orderNumber: 'ORD-000002' }),
      row({ id: '3', orderNumber: 'ORD-000003' }),
    ];

    const page = computeCustomerActivity(rows, { ...query, page: 2, limit: 2 });
    expect(page.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page.transactions).toHaveLength(1);
    const first = computeCustomerActivity(rows, { ...query, limit: 1 }).transactions[0];
    expect(first?.totalAmountRial).toBe('250.50');
    expect(first?.weightGrams).toBe('2.500000');
    expect(first?.wageAmount).toBe('10.00');
  });

  it('reads buy and sell only from item metadata', () => {
    expect(readOrderSide({ side: 'BUY' })).toBe('BUY');
    expect(readOrderSide({ side: 'SELL' })).toBe('SELL');
    expect(readOrderSide({ side: 'HOLD' })).toBeNull();
    expect(readOrderSide(null)).toBeNull();
    expect(readOrderSide([])).toBeNull();
  });
});
