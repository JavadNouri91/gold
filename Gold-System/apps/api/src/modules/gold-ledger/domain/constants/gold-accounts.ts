/**
 * Gold Ledger Accounts
 *
 * Source: docs/21-business-decisions.md §6.2
 * CRITICAL RULE: Do NOT add accounts not listed here without a formal decision record.
 *
 * These accounts track actual gold weight movements (physical/contractual),
 * NOT customer Rial-based credit limits (those live in CustomerAccount).
 *
 * Important clarification (§3.2, §6.2):
 * - Customer gold capacity = CustomerAccount.credit_limit_gold_rial ÷ current_price
 * - CustomerAccount holds a Rial-denominated limit, NOT a GoldLedgerEntry balance
 * - GoldLedgerEntry records store-level gold position and obligations ONLY
 */

// ─── Gold Account Definitions ─────────────────────────────────────────────────

export interface GoldAccountDefinition {
  code: string;
  name: string;
  nameFa: string;
  /** True if posting to this account is available in MVP. */
  active: boolean;
  blockedReason?: string;
}

/**
 * Gold Chart of Accounts as defined in §6.2.
 * NEVER add entries without a corresponding business decision.
 */
export const GOLD_ACCOUNTS: Record<string, GoldAccountDefinition> = {
  'GA-01': {
    code: 'GA-01',
    name: 'Store Gold Position',
    nameFa: 'موجودی طلای فروشگاه',
    active: true,
    // Note: posting rules for upstream purchase → GA-01 are OPEN (#39).
    // GA-01 is defined and active, but purchase posting rules are pending.
    // Trade posting to GA-01 (at confirmation vs delivery) is NOT yet documented.
  },
  'GA-02': {
    code: 'GA-02',
    name: 'Gold Obligation to Customer',
    nameFa: 'تعهد طلایی به مشتری',
    active: true,
    // GA-02: gold committed to customer via confirmed Trade — §6.2
    // Trade Confirmed → GA-02 IN entry for committed gold weight
    // Trade Reversed  → GA-02 OUT entry for released obligation
  },
  'GA-03': {
    code: 'GA-03',
    name: 'Gold Reversal / Adjustment',
    nameFa: 'برگشت / تعدیل طلا',
    active: true,
  },
} as const;

/**
 * Gold movement direction from the account's perspective.
 * IN  = gold entering / obligation being created
 * OUT = gold leaving / obligation being fulfilled or released
 */
export enum GoldDirection {
  IN = 'IN',
  OUT = 'OUT',
}

/**
 * Returns a gold account definition by code.
 * @throws Error if the code is not defined.
 */
export function getGoldAccount(code: string): GoldAccountDefinition {
  const account = GOLD_ACCOUNTS[code];
  if (!account) {
    throw new Error(
      `[GoldAccounts] Account "${code}" is not defined. ` +
        `Do not post to undocumented gold accounts. ` +
        `Valid accounts: ${Object.keys(GOLD_ACCOUNTS).join(', ')}`,
    );
  }
  return account;
}

/**
 * Validates that posting to this gold account is permitted.
 * Throws if the account is BLOCKED or DEFERRED.
 */
export function assertGoldAccountActive(code: string): void {
  const account = getGoldAccount(code);
  if (!account.active) {
    throw new Error(
      `[GoldAccounts] Account "${code}" (${account.name}) cannot be posted to: ` +
        `${account.blockedReason ?? 'not active in MVP'}`,
    );
  }
}
