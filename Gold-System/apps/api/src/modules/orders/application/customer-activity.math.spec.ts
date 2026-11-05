import {
  activityBucketKey,
  computeCustomerActivity,
  computeCustomerHolding,
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

  it('expands a display group so CLOSED includes cancelled and rejected', () => {
    const result = computeCustomerActivity(
      [
        row({ id: 'ok', weightGrams: '5.000000' }),
        row({
          id: 'cancelled',
          status: 'CANCELLED',
          weightGrams: '3.000000',
          totalAmountRial: '30.00',
        }),
        row({
          id: 'rejected',
          status: 'REJECTED',
          weightGrams: '2.000000',
          totalAmountRial: '20.00',
        }),
      ],
      { ...query, status: 'CLOSED' },
    );

    expect(result.meta.total).toBe(2);
    expect(result.volume.grams).toBe('5.000000');
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

  it('nets booked buy and sell grams for the customer holding', () => {
    expect(
      computeCustomerHolding([
        row({ id: 'buy', side: 'BUY', weightGrams: '30.000000', totalAmountRial: '1500000000.00' }),
        row({
          id: 'sell',
          side: 'SELL',
          weightGrams: '10.000000',
          totalAmountRial: '600000000.00',
        }),
        row({ id: 'draft', status: 'DRAFT', side: 'BUY', weightGrams: '5.000000' }),
        row({ id: 'unknown', side: null, weightGrams: '2.000000' }),
      ]),
    ).toEqual({
      weightGrams: '20.000000',
      confirmedWeightGrams: '0.000000',
      ownedGoldGrams: '0.000000',
      reservedPickupGrams: '0.000000',
      pendingPurchaseGrams: '0.000000',
      pendingPurchaseAmountRial: '0.00',
      purityRatio: '0.750000',
      averageBuyPriceRial: '50000000.00',
      totalBuyValueRial: '1500000000.00',
      totalSellValueRial: '600000000.00',
    });
  });

  it('subtracts committed pickup grams from available holding', () => {
    expect(
      computeCustomerHolding(
        [
          row({
            id: 'buy',
            side: 'BUY',
            weightGrams: '30.000000',
            totalAmountRial: '1500000000.00',
          }),
        ],
        { pickupReservedGrams: '5.000000', pickupCommittedGrams: '12.000000' },
      ),
    ).toMatchObject({
      weightGrams: '18.000000',
      reservedPickupGrams: '5.000000',
    });
  });
});

describe('activityBucketKey', () => {
  const instant = new Date('2026-09-15T08:00:00.000Z');

  it('groups the same instant by Jalali day, week, month, and quarter', () => {
    expect(activityBucketKey(instant, 'day')).toMatch(/^D:\d{4}-\d{2}-\d{2}$/);
    expect(activityBucketKey(instant, 'week')).toMatch(/^W:\d{4}-\d{2}-\d{2}$/);
    expect(activityBucketKey(instant, 'month')).toMatch(/^M:\d{4}-\d{2}$/);
    expect(activityBucketKey(instant, 'quarter')).toMatch(/^Q:\d{4}-\d{2}$/);
    expect(activityBucketKey(instant, 'day')).not.toBe(activityBucketKey(instant, 'week'));
  });
});

describe('pending purchase holdings', () => {
  it('combines only paid pending purchase weights', () => {
    expect(
      computeCustomerHolding([
        row({ id: 'first', status: 'UNDER_REVIEW', weightGrams: '2', reservedAmountRial: '100' }),
        row({ id: 'second', status: 'QUOTED', weightGrams: '3', reservedAmountRial: '180' }),
        row({ id: 'unpaid', status: 'SUBMITTED', weightGrams: '20', reservedAmountRial: '0' }),
        row({ id: 'sell', side: 'SELL', status: 'UNDER_REVIEW', weightGrams: '1' }),
      ]),
    ).toMatchObject({
      pendingPurchaseGrams: '5.000000',
      pendingPurchaseAmountRial: '280.00',
      weightGrams: '0.000000',
    });
  });
  it.each(['SUBMITTED', 'QUOTED', 'ASSIGNED', 'UNDER_REVIEW', 'REVISION_REQUESTED'])(
    'keeps %s paid orders separate from confirmed gold and average cost',
    (status) => {
      const result = computeCustomerHolding([
        row({ id: 'confirmed', weightGrams: '2', totalAmountRial: '100' }),
        row({
          id: 'pending',
          status,
          weightGrams: '3',
          totalAmountRial: '180',
          reservedAmountRial: '180',
        }),
      ]);
      expect(result).toMatchObject({
        weightGrams: '2.000000',
        averageBuyPriceRial: '50.00',
        pendingPurchaseGrams: '3.000000',
        pendingPurchaseAmountRial: '180.00',
      });
    },
  );

  it('moves an approved purchase into holdings once on repeated reads', () => {
    const rows = [
      row({
        status: 'APPROVED',
        weightGrams: '3',
        totalAmountRial: '180',
        reservedAmountRial: '180',
      }),
    ];
    const expected = {
      weightGrams: '3.000000',
      pendingPurchaseGrams: '0.000000',
      pendingPurchaseAmountRial: '0.00',
    };
    expect(computeCustomerHolding(rows)).toMatchObject(expected);
    expect(computeCustomerHolding(rows)).toMatchObject(expected);
  });

  it('uses a confirmed trade as the source of truth even if the order status lags', () => {
    expect(
      computeCustomerHolding([
        row({
          status: 'APPROVED',
          weightGrams: '4',
          trade: {
            id: 'trade-1',
            tradeNumber: 'TRD-1',
            status: 'CONFIRMED',
            totalAmountRial: '200',
            weightGrams: '4',
            unitPriceRial: '50',
            wageAmount: null,
            taxAmount: null,
            confirmedAt: null,
            quotationId: null,
          },
        }),
      ]),
    ).toMatchObject({ weightGrams: '4.000000', pendingPurchaseGrams: '0.000000' });
  });

  it('keeps confirmed holdings separate from open sell and pickup reservations', () => {
    const trade = (id: string, side: 'BUY' | 'SELL', weightGrams: string): ActivityOrderInput =>
      row({
        id,
        status: 'COMPLETED',
        side,
        weightGrams,
        trade: {
          id: `trade-${id}`,
          tradeNumber: `TRD-${id}`,
          status: 'CONFIRMED',
          totalAmountRial: '100',
          weightGrams,
          unitPriceRial: '100',
          wageAmount: null,
          taxAmount: null,
          confirmedAt: null,
          quotationId: null,
        },
      });
    const holding = computeCustomerHolding(
      [
        trade('buy', 'BUY', '3.813'),
        row({ id: 'pending-sell', status: 'QUOTED', side: 'SELL', weightGrams: '2' }),
      ],
      { pickupReservedGrams: '2', pickupCommittedGrams: '2' },
    );

    expect(holding.weightGrams).toBe('0.000000');
    expect(holding.confirmedWeightGrams).toBe('1.813000');
    expect(holding.ownedGoldGrams).toBe('3.813000');
  });

  it('counts the 5g pending purchase in neither confirmed wallet nor owned gold', () => {
    const holding = computeCustomerHolding(
      [
        row({ id: 'approved-buy', status: 'COMPLETED', side: 'BUY', weightGrams: '3.813', trade: {
          id: 'trade-final', tradeNumber: 'TRD-1', status: 'CONFIRMED', totalAmountRial: '1000',
          weightGrams: '3.813', unitPriceRial: '250', wageAmount: null, taxAmount: null,
          confirmedAt: null, quotationId: null,
        } }),
        row({ id: 'pending-buy', status: 'QUOTED', side: 'BUY', weightGrams: '5', reservedAmountRial: '1333082250' }),
      ],
      { pickupReservedGrams: '2', pickupCommittedGrams: '2' },
    );
    expect(holding).toMatchObject({
      weightGrams: '1.813000', confirmedWeightGrams: '1.813000', ownedGoldGrams: '3.813000',
      pendingPurchaseGrams: '5.000000', pendingPurchaseAmountRial: '1333082250.00',
    });
  });

  it.each(['DRAFT', 'REJECTED', 'CANCELLED'])(
    'excludes %s purchases from pending and confirmed balances',
    (status) => {
      expect(computeCustomerHolding([row({ status, reservedAmountRial: '180' })])).toMatchObject({
        weightGrams: '0.000000',
        pendingPurchaseGrams: '0.000000',
        pendingPurchaseAmountRial: '0.00',
        averageBuyPriceRial: null,
      });
    },
  );

  it('does not let a pending purchase fund a sell or pickup', () => {
    expect(
      computeCustomerHolding([
        row({ status: 'UNDER_REVIEW', weightGrams: '100', reservedAmountRial: '1000' }),
      ]).weightGrams,
    ).toBe('0.000000');
  });
});
