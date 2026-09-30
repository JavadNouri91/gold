import { CustomerAccountStatus, CustomerStatus, CustomerType } from '@gold/shared-types';
import { Prisma } from '@prisma/client';
import {
  CustomerFinancialStatus,
  CustomerSegment,
  CustomerVerificationStatus,
  csvCell,
  financialStatusOf,
  matchesLastPurchase,
  matchesSegment,
  primarySegment,
  verificationOf,
} from './customer-directory.policy';

const now = new Date('2026-09-27T12:00:00.000Z');

function facts(overrides: Partial<Parameters<typeof matchesSegment>[0]> = {}) {
  return {
    type: CustomerType.HOUSEHOLD,
    status: CustomerStatus.ACTIVE,
    accountStatus: CustomerAccountStatus.ACTIVE,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('customer directory policy', () => {
  it('keeps verification separate from the operational account status', () => {
    expect(verificationOf(CustomerStatus.PENDING)).toBe(CustomerVerificationStatus.UNVERIFIED);
    expect(verificationOf(CustomerStatus.UNDER_REVIEW)).toBe(
      CustomerVerificationStatus.PENDING_REVIEW,
    );
    expect(verificationOf(CustomerStatus.APPROVED)).toBe(CustomerVerificationStatus.VERIFIED);
    expect(verificationOf(CustomerStatus.ACTIVE)).toBe(CustomerVerificationStatus.VERIFIED);
    expect(verificationOf(CustomerStatus.REJECTED)).toBe(CustomerVerificationStatus.REJECTED);
    expect(verificationOf(CustomerStatus.SUSPENDED)).toBe(CustomerVerificationStatus.VERIFIED);
  });

  it('matches segment filters independently of the primary label', () => {
    const recentVip = facts({
      type: CustomerType.VIP,
      createdAt: new Date('2026-09-10T00:00:00.000Z'),
    });
    expect(matchesSegment(recentVip, CustomerSegment.VIP, now)).toBe(true);
    expect(matchesSegment(recentVip, CustomerSegment.NEW, now)).toBe(true);
    expect(primarySegment(recentVip, now)).toBe(CustomerSegment.NEW);
    expect(matchesSegment(facts(), CustomerSegment.REGULAR, now)).toBe(true);
    expect(
      matchesSegment(
        facts({ accountStatus: CustomerAccountStatus.INACTIVE }),
        CustomerSegment.INACTIVE,
        now,
      ),
    ).toBe(true);
  });

  it('classifies balance sign as debtor, creditor, or settled', () => {
    expect(financialStatusOf(new Prisma.Decimal('-1'))).toBe(CustomerFinancialStatus.DEBTOR);
    expect(financialStatusOf(new Prisma.Decimal('10'))).toBe(CustomerFinancialStatus.CREDITOR);
    expect(financialStatusOf(new Prisma.Decimal(0))).toBe(CustomerFinancialStatus.SETTLED);
  });

  it('requires a purchase date when a last-purchase range is set', () => {
    expect(matchesLastPurchase(null, '2026-01-01', '2026-02-01')).toBe(false);
    expect(
      matchesLastPurchase(new Date('2026-01-15T12:00:00+03:30'), '2026-01-01', '2026-01-31'),
    ).toBe(true);
  });

  it('escapes spreadsheet formulas in CSV cells', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('علی, رضایی')).toBe('"علی, رضایی"');
  });
});
