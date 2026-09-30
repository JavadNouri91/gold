import { CustomerAccountStatus, CustomerStatus, CustomerType } from '@gold/shared-types';
import { Prisma } from '@prisma/client';

export const NEW_CUSTOMER_DAYS = 30;
export const LEGACY_CUSTOMER_DAYS = 365;

export enum CustomerSegment {
  REGULAR = 'REGULAR',
  VIP = 'VIP',
  WHOLESALE = 'WHOLESALE',
  PARTNER = 'PARTNER',
  NEW = 'NEW',
  LEGACY = 'LEGACY',
  INACTIVE = 'INACTIVE',
}

export enum CustomerFinancialStatus {
  DEBTOR = 'DEBTOR',
  CREDITOR = 'CREDITOR',
  SETTLED = 'SETTLED',
}

export enum CustomerVerificationStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export interface DirectoryCustomerFacts {
  type: CustomerType | null;
  status: CustomerStatus;
  accountStatus: CustomerAccountStatus;
  createdAt: Date;
}

export function verificationOf(status: CustomerStatus): CustomerVerificationStatus {
  switch (status) {
    case CustomerStatus.PENDING:
      return CustomerVerificationStatus.UNVERIFIED;
    case CustomerStatus.UNDER_REVIEW:
      return CustomerVerificationStatus.PENDING_REVIEW;
    case CustomerStatus.REJECTED:
      return CustomerVerificationStatus.REJECTED;
    default:
      return CustomerVerificationStatus.VERIFIED;
  }
}

export function statusesForVerification(
  verification: CustomerVerificationStatus,
): CustomerStatus[] {
  switch (verification) {
    case CustomerVerificationStatus.UNVERIFIED:
      return [CustomerStatus.PENDING];
    case CustomerVerificationStatus.PENDING_REVIEW:
      return [CustomerStatus.UNDER_REVIEW];
    case CustomerVerificationStatus.REJECTED:
      return [CustomerStatus.REJECTED];
    default:
      return [
        CustomerStatus.APPROVED,
        CustomerStatus.ACTIVE,
        CustomerStatus.SUSPENDED,
        CustomerStatus.BLOCKED,
      ];
  }
}

export function tehranDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000+03:30`);
}

export function tehranDayEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999+03:30`);
}

export function isNewCustomer(createdAt: Date, now = new Date()): boolean {
  const cutoff = new Date(now.getTime() - NEW_CUSTOMER_DAYS * 24 * 60 * 60 * 1000);
  return createdAt >= cutoff;
}

export function isLegacyCustomer(createdAt: Date, now = new Date()): boolean {
  const cutoff = new Date(now.getTime() - LEGACY_CUSTOMER_DAYS * 24 * 60 * 60 * 1000);
  return createdAt < cutoff;
}

export function matchesSegment(
  customer: DirectoryCustomerFacts,
  segment: CustomerSegment,
  now = new Date(),
): boolean {
  switch (segment) {
    case CustomerSegment.INACTIVE:
      return customer.accountStatus === CustomerAccountStatus.INACTIVE;
    case CustomerSegment.NEW:
      return isNewCustomer(customer.createdAt, now);
    case CustomerSegment.LEGACY:
      return isLegacyCustomer(customer.createdAt, now);
    case CustomerSegment.VIP:
      return customer.type === CustomerType.VIP;
    case CustomerSegment.WHOLESALE:
      return customer.type === CustomerType.WHOLESALE;
    case CustomerSegment.PARTNER:
      return customer.type === CustomerType.PARTNER;
    case CustomerSegment.REGULAR:
      return customer.type == null || customer.type === CustomerType.HOUSEHOLD;
    default:
      return false;
  }
}

/** Single label for the profile header. Filters use `matchesSegment` independently. */
export function primarySegment(
  customer: DirectoryCustomerFacts,
  now = new Date(),
): CustomerSegment {
  if (customer.accountStatus === CustomerAccountStatus.INACTIVE) return CustomerSegment.INACTIVE;
  if (isNewCustomer(customer.createdAt, now)) return CustomerSegment.NEW;
  if (isLegacyCustomer(customer.createdAt, now)) return CustomerSegment.LEGACY;
  if (customer.type === CustomerType.VIP) return CustomerSegment.VIP;
  if (customer.type === CustomerType.WHOLESALE) return CustomerSegment.WHOLESALE;
  if (customer.type === CustomerType.PARTNER) return CustomerSegment.PARTNER;
  return CustomerSegment.REGULAR;
}

export function financialStatusOf(balance: Prisma.Decimal): CustomerFinancialStatus {
  if (balance.lessThan(0)) return CustomerFinancialStatus.DEBTOR;
  if (balance.greaterThan(0)) return CustomerFinancialStatus.CREDITOR;
  return CustomerFinancialStatus.SETTLED;
}

export function matchesFinancial(
  balance: Prisma.Decimal,
  filter: CustomerFinancialStatus,
): boolean {
  return financialStatusOf(balance) === filter;
}

export function matchesLastPurchase(
  lastPurchaseAt: Date | null,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  if (!lastPurchaseAt) return false;
  if (from && lastPurchaseAt < tehranDayStart(from)) return false;
  if (to && lastPurchaseAt > tehranDayEnd(to)) return false;
  return true;
}

export interface CustomerStats {
  orderCount: number;
  lastPurchaseAt: Date | null;
  purchaseTotal: Prisma.Decimal;
  paidTotal: Prisma.Decimal;
  weightGrams: Prisma.Decimal;
  balance: Prisma.Decimal;
}

export function emptyStats(): CustomerStats {
  const zero = new Prisma.Decimal(0);
  return {
    orderCount: 0,
    lastPurchaseAt: null,
    purchaseTotal: zero,
    paidTotal: zero,
    weightGrams: zero,
    balance: zero,
  };
}

export function csvCell(value: string): string {
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}
