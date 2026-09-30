import { hasPermission, isStaffUser } from '@/lib/permissions';
import { firstStaffRoute, visibleNav } from '@/lib/nav';

describe('staff permissions', () => {
  it('treats customer self-service permissions as non-staff', () => {
    expect(
      isStaffUser([
        'customer.profile.read',
        'customer.order.read_own',
        'customer.account.read_own',
      ]),
    ).toBe(false);
  });

  it('treats any internal permission as staff without hard-coding a role name', () => {
    expect(isStaffUser(['order.read'])).toBe(true);
    expect(isStaffUser(['ledger.read'])).toBe(true);
  });

  it('matches any listed permission', () => {
    expect(hasPermission(['trade.approve'], ['trade.review', 'trade.approve'])).toBe(true);
    expect(hasPermission(['customer.order.read_own'], 'order.read')).toBe(false);
  });
});

describe('role-based navigation', () => {
  it('shows the reviewer queue only when review permission exists', () => {
    const hrefs = visibleNav(['trade.review']).map((item) => item.href);
    expect(hrefs).toContain('/dashboard/assignments');
    expect(hrefs).not.toContain('/dashboard/ledger/financial');
    expect(hrefs).not.toContain('/dashboard/payments');
  });

  it('shows accountant financial pages and hides supplier creation-only gaps', () => {
    const hrefs = visibleNav(['payment.read', 'settlement.read', 'ledger.read']).map((item) => item.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/dashboard/payments',
        '/dashboard/settlements',
        '/dashboard/ledger/financial',
        '/dashboard/audit',
      ]),
    );
    expect(hrefs).not.toContain('/dashboard/suppliers');
  });

  it('lands an operator on the first permitted page', () => {
    expect(firstStaffRoute(['order.read', 'quotation.read', 'customer.read'])).toBe(
      '/dashboard/customers',
    );
  });
});
