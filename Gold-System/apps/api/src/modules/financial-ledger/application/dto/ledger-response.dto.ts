import Decimal from 'decimal.js';
import {
  FinancialLedgerJournalEntity,
  FinancialLedgerEntryEntity,
} from '../../domain/entities/financial-ledger-journal.entity';

// ─── Entry Response ───────────────────────────────────────────────────────────

export class LedgerEntryResponseDto {
  id!: string;
  journalId!: string;
  accountCode!: string;
  accountName!: string;
  accountType!: string;
  debit!: string;
  credit!: string;
  currency!: string;
  description!: string | null;
  createdAt!: string;

  static fromEntity(e: FinancialLedgerEntryEntity): LedgerEntryResponseDto {
    const dto = new LedgerEntryResponseDto();
    dto.id = e.id;
    dto.journalId = e.journalId;
    dto.accountCode = e.accountCode;
    dto.accountName = e.accountName;
    dto.accountType = e.accountType;
    dto.debit = e.debit.toFixed(2);
    dto.credit = e.credit.toFixed(2);
    dto.currency = e.currency;
    dto.description = e.description;
    dto.createdAt = e.createdAt.toISOString();
    return dto;
  }
}

// ─── Journal Response ─────────────────────────────────────────────────────────

export class LedgerJournalResponseDto {
  id!: string;
  idempotencyKey!: string;
  sourceType!: string;
  sourceId!: string;
  description!: string | null;
  postedAt!: string;
  postedByUserId!: string | null;
  totalDebits!: string;
  totalCredits!: string;
  isBalanced!: boolean;
  entries!: LedgerEntryResponseDto[];

  static fromEntity(j: FinancialLedgerJournalEntity): LedgerJournalResponseDto {
    const dto = new LedgerJournalResponseDto();
    dto.id = j.id;
    dto.idempotencyKey = j.idempotencyKey;
    dto.sourceType = j.sourceType;
    dto.sourceId = j.sourceId;
    dto.description = j.description;
    dto.postedAt = j.postedAt.toISOString();
    dto.postedByUserId = j.postedByUserId;
    dto.totalDebits = j.totalDebits().toFixed(2);
    dto.totalCredits = j.totalCredits().toFixed(2);
    dto.isBalanced = j.isBalanced();
    dto.entries = j.entries.map((e) => LedgerEntryResponseDto.fromEntity(e));
    return dto;
  }
}

// ─── Account Balance Response ─────────────────────────────────────────────────

export class AccountBalanceResponseDto {
  accountCode!: string;
  totalDebit!: string;
  totalCredit!: string;
  /** Debit - Credit balance */
  balance!: string;
  currency!: string;

  static fromData(data: {
    accountCode: string;
    totalDebit: Decimal;
    totalCredit: Decimal;
    balance: Decimal;
  }): AccountBalanceResponseDto {
    const dto = new AccountBalanceResponseDto();
    dto.accountCode = data.accountCode;
    dto.totalDebit = data.totalDebit.toFixed(2);
    dto.totalCredit = data.totalCredit.toFixed(2);
    dto.balance = data.balance.toFixed(2);
    dto.currency = 'IRR';
    return dto;
  }
}

// ─── Reconciliation Report ────────────────────────────────────────────────────

export class ReconciliationReportDto {
  /** UTC timestamp when reconciliation was run. */
  runAt!: string;

  /** Journals where total debits ≠ total credits. */
  unbalancedJournals!: Array<{
    journalId: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
    totalDebit: string;
    totalCredit: string;
    imbalance: string;
  }>;

  /** Source events that have more than one journal (potential duplicates). */
  duplicateSourcePostings!: Array<{
    sourceType: string;
    sourceId: string;
    journalCount: number;
    journalIds: string[];
  }>;

  /** Journals referencing a Trade that no longer exists. */
  missingSourceReferences!: Array<{
    journalId: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
  }>;

  isHealthy!: boolean;

  static build(data: {
    unbalancedJournals: Array<{
      journalId: string;
      idempotencyKey: string;
      sourceType: string;
      sourceId: string;
      totalDebit: Decimal;
      totalCredit: Decimal;
      imbalance: Decimal;
    }>;
    duplicateSourcePostings: Array<{
      sourceType: string;
      sourceId: string;
      journalCount: number;
      journalIds: string[];
    }>;
    missingSourceReferences: Array<{
      journalId: string;
      idempotencyKey: string;
      sourceType: string;
      sourceId: string;
    }>;
  }): ReconciliationReportDto {
    const dto = new ReconciliationReportDto();
    dto.runAt = new Date().toISOString();
    dto.unbalancedJournals = data.unbalancedJournals.map((j) => ({
      journalId: j.journalId,
      idempotencyKey: j.idempotencyKey,
      sourceType: j.sourceType,
      sourceId: j.sourceId,
      totalDebit: j.totalDebit.toFixed(2),
      totalCredit: j.totalCredit.toFixed(2),
      imbalance: j.imbalance.toFixed(2),
    }));
    dto.duplicateSourcePostings = data.duplicateSourcePostings;
    dto.missingSourceReferences = data.missingSourceReferences;
    dto.isHealthy =
      data.unbalancedJournals.length === 0 &&
      data.duplicateSourcePostings.length === 0 &&
      data.missingSourceReferences.length === 0;
    return dto;
  }
}
