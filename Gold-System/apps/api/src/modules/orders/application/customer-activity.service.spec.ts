import { CustomerActivityService } from './customer-activity.service';

describe('CustomerActivityService ownership', () => {
  it('loads orders only for the customer resolved from the authenticated user', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'customer-1' });
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      customer: { findUnique },
      order: { findMany, count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CustomerActivityService(prisma as never);

    await service.summary('user-1', {
      from: '2026-09-01T00:00:00.000+03:30',
      to: '2026-09-30T23:59:59.999+03:30',
    });

    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' }, select: { id: true } });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: 'customer-1' }),
      }),
    );
  });

  it('returns an empty book when the user has no customer profile', async () => {
    const findMany = jest.fn();
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
      order: { findMany, count: jest.fn() },
    };
    const service = new CustomerActivityService(prisma as never);
    const summary = await service.summary('user-1', {
      from: '2026-09-01T00:00:00.000+03:30',
      to: '2026-09-30T23:59:59.999+03:30',
    });

    expect(findMany).not.toHaveBeenCalled();
    expect(summary.volume.grams).toBe('0.000000');
    expect(summary.pnl.supported).toBe(false);
    expect(summary.hasAny).toBe(false);
  });

  it('does not look up another customer when reading one order', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1' }) },
      order: { findFirst },
    };
    const service = new CustomerActivityService(prisma as never);

    await expect(service.detail('user-1', 'order-9', false)).rejects.toThrow(/not found/i);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'order-9', customerId: 'customer-1' },
      }),
    );
  });

  it('sellable weight is booked buys minus booked sells', async () => {
    const findMany = jest.fn().mockResolvedValue([
      booked('buy-1', 'BUY', '5.000000'),
      booked('sell-1', 'SELL', '2.000000'),
      { ...booked('draft-1', 'SELL', '9.000000'), status: 'DRAFT' },
    ]);
    const service = new CustomerActivityService({ order: { findMany } } as never);
    const db = { order: { findMany } };

    const grams = await service.sellableWeightGrams('customer-1', db as never);
    expect(grams.toFixed(6)).toBe('3.000000');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'customer-1' } }));
  });
});

function booked(id: string, side: 'BUY' | 'SELL', weightGrams: string) {
  return {
    id,
    orderNumber: id,
    status: 'TRADE_CREATED',
    totalAmountRial: { toString: () => '1000.00' },
    weightGrams: { toString: () => weightGrams },
    purityRatio: { toString: () => '0.750000' },
    reservedAmountRial: { toString: () => '0.00' },
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [{ unitPriceRial: { toString: () => '200.000000' }, metadata: { side } }],
    trade: {
      id: `trade-${id}`,
      tradeNumber: `T-${id}`,
      status: 'CONFIRMED',
      totalAmountRial: { toString: () => '1000.00' },
      weightGrams: { toString: () => weightGrams },
      unitPriceRial: { toString: () => '200.000000' },
      wageAmount: null,
      taxAmount: null,
      confirmedAt: new Date('2026-01-02T00:00:00.000Z'),
      quotationId: null,
      payments: [],
      settlement: null,
    },
    quotations: [],
  };
}
