/**
 * Chart of Accounts — Financial Ledger
 *
 * Source: docs/21-business-decisions.md §6.1
 * CRITICAL RULE: Do NOT add accounts not listed here without a formal decision record.
 *
 * Accounts marked BLOCKED are defined in the schema but posting rules are pending
 * business decisions (see docs/open-questions.md and docs/21-business-decisions.md §13).
 *
 * Accounts marked DEFERRED are out of MVP scope.
 */

import { HttpException, HttpStatus } from '@nestjs/common';

// ─── Account Types ────────────────────────────────────────────────────────────

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
  CLEARING = 'CLEARING',
}

// ─── Financial Account Definitions ───────────────────────────────────────────

export interface AccountDefinition {
  code: string;
  name: string;
  nameFa: string;
  type: AccountType;
  /** True if this account is available for posting in MVP. */
  active: boolean;
  /** Reason why not active (if applicable). */
  blockedReason?: string;
}

/**
 * Full Chart of Accounts as defined in §6.1.
 * NEVER add entries here without a corresponding business decision record.
 */
export const FINANCIAL_ACCOUNTS: Record<string, AccountDefinition> = {
  'FA-01': {
    code: 'FA-01',
    name: 'Customer Receivable',
    nameFa: 'مطالبات مشتری',
    type: AccountType.ASSET,
    active: true,
  },
  'FA-02': {
    code: 'FA-02',
    name: 'Customer Prepaid / Deposit',
    nameFa: 'پیش‌دریافت مشتری',
    type: AccountType.LIABILITY,
    active: true,
  },
  'FA-03': {
    code: 'FA-03',
    name: 'Supplier Payable',
    nameFa: 'بدهی به بالادستی',
    type: AccountType.LIABILITY,
    active: true,
  },
  'FA-04': {
    code: 'FA-04',
    name: 'Cash',
    nameFa: 'صندوق',
    type: AccountType.ASSET,
    active: true,
  },
  'FA-05': {
    code: 'FA-05',
    name: 'Bank',
    nameFa: 'بانک',
    type: AccountType.ASSET,
    active: true,
  },
  'FA-06': {
    code: 'FA-06',
    name: 'Sales Revenue',
    nameFa: 'درآمد فروش',
    type: AccountType.REVENUE,
    active: true,
  },
  'FA-07': {
    code: 'FA-07',
    name: 'Sales Profit',
    nameFa: 'سود فروش',
    type: AccountType.REVENUE,
    active: false,
    // BLOCKED: docs/open-questions.md #35, docs/21-business-decisions.md §13.2
    // Profit calculation base is not yet defined.
    // Must NOT be posted until §13.2 is resolved.
    blockedReason: 'BLOCKED §13.2 — profit calculation base undefined',
  },
  'FA-08': {
    code: 'FA-08',
    name: 'Purchase Cost',
    nameFa: 'بهای خرید',
    type: AccountType.EXPENSE,
    active: true,
  },
  'FA-09': {
    code: 'FA-09',
    name: 'Tax Payable',
    nameFa: 'مالیات پرداختنی',
    type: AccountType.LIABILITY,
    active: false,
    // BLOCKED: docs/open-questions.md #36, docs/21-business-decisions.md §13.3
    // Tax percentage and taxable base are not yet defined.
    // Must NOT be posted until §13.3 is resolved.
    blockedReason: 'BLOCKED §13.3 — tax percentage and taxable base undefined',
  },
  'FA-10': {
    code: 'FA-10',
    name: 'Discount Expense',
    nameFa: 'تخفیف اعطایی',
    type: AccountType.EXPENSE,
    active: true,
  },
  'FA-11': {
    code: 'FA-11',
    name: 'Price Adjustments',
    nameFa: 'تعدیلات قیمت',
    type: AccountType.EXPENSE,
    active: true,
  },
  'FA-12': {
    code: 'FA-12',
    name: 'Customer Settlement',
    nameFa: 'تسویه مشتری',
    type: AccountType.CLEARING,
    active: true,
  },
  'FA-13': {
    code: 'FA-13',
    name: 'Supplier Settlement',
    nameFa: 'تسویه بالادستی',
    type: AccountType.CLEARING,
    active: false,
    // DEFERRED: docs/21-business-decisions.md §8.4 — supplier settlement not in MVP
    blockedReason: 'DEFERRED — supplier settlement not in MVP (§8.4)',
  },
  'FA-14': {
    code: 'FA-14',
    name: 'Reversal / Adjustment',
    nameFa: 'برگشت / تعدیل',
    type: AccountType.CLEARING,
    active: true,
  },
  'FA-15': {
    code: 'FA-15',
    name: 'Operating Expenses',
    nameFa: 'هزینه‌های عمومی',
    type: AccountType.EXPENSE,
    active: true,
    // Note: sub-categories OPEN — docs/21-business-decisions.md §13.5
    // FA-15 is confirmed; sub-categories not yet defined.
  },
} as const;

/** Wage Income account is explicitly NOT required for molten gold MVP. §1.6 */
// No FA-16 or Wage Income account — deliberately excluded

/**
 * Retrieves an account definition by code.
 * @throws Error if the code is not a defined account — prevents undocumented posting
 */
export function getAccount(code: string): AccountDefinition {
  const account = FINANCIAL_ACCOUNTS[code];
  if (!account) {
    throw new Error(
      `[ChartOfAccounts] Account "${code}" is not defined. ` +
        `Do not post to undocumented accounts. ` +
        `Valid accounts: ${Object.keys(FINANCIAL_ACCOUNTS).join(', ')}`,
    );
  }
  return account;
}

/**
 * Validates that posting to this account is permitted.
 * Throws AccountNotActiveException (HTTP 422) if the account is BLOCKED or DEFERRED.
 */
export function assertAccountActive(code: string): void {
  const account = getAccount(code);
  if (!account.active) {
    throw new HttpException(
      {
        code: 'ACCOUNT_NOT_ACTIVE',
        message: `Cannot post to account ${code} (${account.name}): ${account.blockedReason ?? 'not active in MVP'}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
