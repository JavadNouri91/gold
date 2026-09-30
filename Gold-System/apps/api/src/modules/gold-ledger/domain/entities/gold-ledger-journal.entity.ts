import Decimal from 'decimal.js';

/**
 * GoldLedgerJournal — domain entity
 *
 * Groups gold movement entries for one atomic posting event.
 * Idempotency enforced by unique idempotencyKey (database constraint).
 *
 * Source: docs/21-business-decisions.md §6.2
 */
export class GoldLedgerJournalEntity {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly description: string | null;
  readonly postedAt: Date;
  readonly postedByUserId: string | null;
  readonly entries: GoldLedgerEntryEntity[];

  constructor(data: {
    id: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
    description: string | null;
    postedAt: Date;
    postedByUserId: string | null;
    entries: GoldLedgerEntryEntity[];
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

  /** Net gold IN for a given account code within this journal. */
  netQuantityForAccount(accountCode: string): Decimal {
    return this.entries
      .filter((e) => e.accountCode === accountCode)
      .reduce((sum, e) => {
        return e.direction === 'IN' ? sum.plus(e.quantity) : sum.minus(e.quantity);
      }, new Decimal(0));
  }
}

/**
 * GoldLedgerEntry — domain entity
 *
 * Records one gold weight movement on a gold account.
 * WRITE-ONCE: no update or delete.
 * All quantity/purity values use Decimal (never Float) — BR-P05.
 */
export class GoldLedgerEntryEntity {
  readonly id: string;
  readonly journalId: string;
  readonly accountCode: string;
  readonly accountName: string;
  readonly direction: 'IN' | 'OUT';
  readonly quantity: Decimal;
  readonly purity: Decimal;
  readonly description: string | null;
  readonly createdAt: Date;

  constructor(data: {
    id: string;
    journalId: string;
    accountCode: string;
    accountName: string;
    direction: 'IN' | 'OUT';
    quantity: Decimal;
    purity: Decimal;
    description: string | null;
    createdAt: Date;
  }) {
    this.id = data.id;
    this.journalId = data.journalId;
    this.accountCode = data.accountCode;
    this.accountName = data.accountName;
    this.direction = data.direction;
    this.quantity = data.quantity;
    this.purity = data.purity;
    this.description = data.description;
    this.createdAt = data.createdAt;
  }

  /** Signed quantity: positive for IN, negative for OUT */
  signedQuantity(): Decimal {
    return this.direction === 'IN' ? this.quantity : this.quantity.negated();
  }
}
