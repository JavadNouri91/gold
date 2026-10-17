import {
  OrderStatus,
  ORDER_STATUS_GROUP_ORDER,
  expandOrderStatusFilter,
  orderStatusGroup,
} from '@gold/shared-types';

describe('order status display groups', () => {
  it('exposes exactly five groups', () => {
    expect(ORDER_STATUS_GROUP_ORDER).toHaveLength(5);
  });

  it('folds quoted and assigned orders into IN_REVIEW', () => {
    expect(orderStatusGroup(OrderStatus.QUOTED)).toBe('IN_REVIEW');
    expect(orderStatusGroup(OrderStatus.ASSIGNED)).toBe('IN_REVIEW');
    expect(expandOrderStatusFilter('IN_REVIEW')).toEqual([
      OrderStatus.SUBMITTED,
      OrderStatus.QUOTED,
      OrderStatus.ASSIGNED,
      OrderStatus.UNDER_REVIEW,
    ]);
    expect(expandOrderStatusFilter('AWAITING_REVIEW')).toEqual(
      expandOrderStatusFilter('IN_REVIEW'),
    );
  });

  it('maps every machine status onto a group', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(orderStatusGroup(status)).not.toBeNull();
    }
  });

  it('folds approved and trade statuses into COMPLETED', () => {
    expect(orderStatusGroup(OrderStatus.APPROVED)).toBe('COMPLETED');
    expect(expandOrderStatusFilter('COMPLETED')).toEqual([
      OrderStatus.APPROVED,
      OrderStatus.TRADE_CREATED,
      OrderStatus.SETTLING,
      OrderStatus.COMPLETED,
    ]);
    expect(expandOrderStatusFilter('APPROVED')).toEqual(expandOrderStatusFilter('COMPLETED'));
  });

  it('keeps a raw status as a single-value filter', () => {
    expect(expandOrderStatusFilter(OrderStatus.QUOTED)).toEqual([OrderStatus.QUOTED]);
  });
});
