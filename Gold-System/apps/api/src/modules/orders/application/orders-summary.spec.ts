import { OrderStatus } from '@gold/shared-types';
import { OrdersService } from './orders.service';

describe('Orders pending summary', () => {
  it('counts each side only in the exact UNDER_REVIEW status without pagination', async () => {
    const count = jest.fn().mockReturnValueOnce(7).mockReturnValueOnce(2);
    const service = Object.create(OrdersService.prototype) as OrdersService;
    Object.assign(service, {
      prisma: { order: { count }, $transaction: jest.fn(async (counts) => counts) },
    });

    await expect(service.pendingSummary()).resolves.toEqual({
      pendingBuyOrdersCount: 7,
      pendingSellOrdersCount: 2,
    });
    for (const [index, side] of ['BUY', 'SELL'].entries()) {
      expect(count).toHaveBeenNthCalledWith(index + 1, {
        where: {
          status: OrderStatus.UNDER_REVIEW,
          items: { some: { metadata: { path: ['side'], equals: side } } },
        },
      });
    }
  });
});
