import Decimal from 'decimal.js';

/**
 * FinancialLedgerJournal — domain entity
 *
 * Represents one atomic posting event that groups multiple debit/credit entries.
 * Idempotency is enforced by the unique idempotencyKey (database constraint).
 */
export class FinancialLedgerJournalEntity {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string | null;
  readonly postedAt: Date;
  readonly postedByUserId: string | null;
  readonly entries: FinancialLedgerEntryEntity[];

  constructor(data: {
    id: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
    description: string | null;
    postedAt: Date;
    postedByUserId: string | null;
    entries: FinancialLedgerEntryEntity[];
  }) {
    this.id = data.id;
    this.idempotencyKey = data.idempotencyKey;
    this.sourceType = data.sourceType;
    this.sourceId = data.sourceId;
    this.description = data.description;
    this.postedAt = data.postedAt;
    this.postedByUserId = data.postedByUserId;
    this.entries = data.entries;
  }

  /**
   * Validates double-entry balance: sum of debits must equal sum of credits.
   * Returns null if balanced; returns the imbalance amount otherwise.
   */
  getImbalance(): Decimal | null {
    const totalDebit = this.entries.reduce((sum, e) => sum.plus(e.debit), new Decimal(0));
    const totalCredit = this.entries.reduce((sum, e) => sum.plus(e.credit), new Decimal(0));
    const diff = totalDebit.minus(totalCredit).abs();
    return diff.isZero() ? null : diff;
  }

  /** True if debits = credits for this journal. */
  isBalanced(): boolean {
    return this.getImbalance() === null;
  }

  totalDebits(): Decimal {
    return this.entries.reduce((sum, e) => sum.plus(e.debit), new Decimal(0));
  }

  totalCredits(): Decimal {
    return this.entries.reduce((sum, e) => sum.plus(e.credit), new Decimal(0));
  }
}

/**
 * FinancialLedgerEntry — domain entity
 *
 * An individual debit or credit line within a journal.
 * WRITE-ONCE: no update or delete operations are permitted.
 * Corrections must use reversal journals.
 *
 * Double-entry invariant: exactly one of debit/credit is > 0; the other is 0.
 */
export class FinancialLedgerEntryEntity {
  readonly id: string;
  readonly journalId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly accountType: string;
  readonly debit: Decimal;
  readonly credit: Decimal;
  readonly currency: string;
  readonly description: string | null;
  readonly createdAt: Date;

  constructor(data: {
    id: string;
    journalId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    debit: Decimal;
    credit: Decimal;
    currency: string;
    description: string | null;
    createdAt: Date;
  }) {
    this.id = data.id;
    this.journalId = data.journalId;
    this.accountCode = data.accountCode;
    this.accountName = data.accountName;
    this.accountType = data.accountType;
    this.debit = data.debit;
    this.credit = data.credit;
    this.currency = data.currency;
    this.description = data.description;
    this.createdAt = data.createdAt;
  }

  /** True if this entry is a debit entry (debit > 0). */
  isDebit(): boolean {
    return this.debit.greaterThan(0) && this.credit.isZero();
  }

  /** True if this entry is a credit entry (credit > 0). */
  isCredit(): boolean {
    return this.credit.greaterThan(0) && this.debit.isZero();
  }

  /**
   * Validates single-entry invariant: exactly one of debit/credit must be > 0.
   */
  isValid(): boolean {
    const hasDebit = this.debit.greaterThan(0);
    const hasCredit = this.credit.greaterThan(0);
    return (hasDebit && !hasCredit) || (!hasDebit && hasCredit);
  }
}
