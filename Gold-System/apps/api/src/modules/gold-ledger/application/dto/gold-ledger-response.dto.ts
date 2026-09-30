import Decimal from 'decimal.js';
import {
  GoldLedgerJournalEntity,
  GoldLedgerEntryEntity,
} from '../../domain/entities/gold-ledger-journal.entity';

// ─── Gold Entry Response ──────────────────────────────────────────────────────

export class GoldLedgerEntryResponseDto {
  id!: string;
  journalId!: string;
  accountCode!: string;
  accountName!: string;
  direction!: string;
  quantity!: string;
  purity!: string;
  description!: string | null;
  createdAt!: string;

  static fromEntity(e: GoldLedgerEntryEntity): GoldLedgerEntryResponseDto {
    const dto = new GoldLedgerEntryResponseDto();
    dto.id = e.id;
    dto.journalId = e.journalId;
    dto.accountCode = e.accountCode;
    dto.accountName = e.accountName;
    dto.direction = e.direction;
    dto.quantity = e.quantity.toFixed(6);
    dto.purity = e.purity.toFixed(6);
    dto.description = e.description;
    dto.createdAt = e.createdAt.toISOString();
    return dto;
  }
}

// ─── Gold Journal Response ────────────────────────────────────────────────────

export class GoldLedgerJournalResponseDto {
  id!: string;
  idempotencyKey!: string;
  sourceType!: string;
  sourceId!: string;
  description!: string | null;
  postedAt!: string;
  postedByUserId!: string | null;
  entries!: GoldLedgerEntryResponseDto[];

  static fromEntity(j: GoldLedgerJournalEntity): GoldLedgerJournalResponseDto {
    const dto = new GoldLedgerJournalResponseDto();
    dto.id = j.id;
    dto.idempotencyKey = j.idempotencyKey;
    dto.sourceType = j.sourceType;
    dto.sourceId = j.sourceId;
    dto.description = j.description;
    dto.postedAt = j.postedAt.toISOString();
    dto.postedByUserId = j.postedByUserId;
    dto.entries = j.entries.map((e) => GoldLedgerEntryResponseDto.fromEntity(e));
    return dto;
  }
}

// ─── Gold Account Balance ─────────────────────────────────────────────────────

export class GoldAccountBalanceResponseDto {
  accountCode!: string;
  totalIn!: string;
  totalOut!: string;
  netPosition!: string;
  unit!: string;

  static fromData(data: {
    accountCode: string;
    totalIn: Decimal;
    totalOut: Decimal;
    netPosition: Decimal;
  }): GoldAccountBalanceResponseDto {
    const dto = new GoldAccountBalanceResponseDto();
    dto.accountCode = data.accountCode;
    dto.totalIn = data.totalIn.toFixed(6);
    dto.totalOut = data.totalOut.toFixed(6);
    dto.netPosition = data.netPosition.toFixed(6);
    dto.unit = 'grams';
    return dto;
  }
}

// ─── Gold Reconciliation Report ───────────────────────────────────────────────

export class GoldReconciliationReportDto {
  runAt!: string;
  duplicatePostings!: Array<{
    sourceType: string;
    sourceId: string;
    journalCount: number;
  }>;
  missingSourceReferences!: Array<{
    journalId: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
  }>;
  accountBalances!: Array<{
    accountCode: string;
    netPosition: string;
    unit: string;
  }>;
  isHealthy!: boolean;

  static build(data: {
    duplicatePostings: Array<{
      sourceType: string;
      sourceId: string;
      journalCount: number;
    }>;
    missingSourceReferences: Array<{
      journalId: string;
      idempotencyKey: string;
      sourceType: string;
      sourceId: string;
    }>;
    accountBalances: Array<{ accountCode: string; netPosition: Decimal }>;
  }): GoldReconciliationReportDto {
    const dto = new GoldReconciliationReportDto();
    dto.runAt = new Date().toISOString();
    dto.duplicatePostings = data.duplicatePostings;
    dto.missingSourceReferences = data.missingSourceReferences;
    dto.accountBalances = data.accountBalances.map((b) => ({
      accountCode: b.accountCode,
      netPosition: b.netPosition.toFixed(6),
      unit: 'grams',
    }));
    dto.isHealthy =
      data.duplicatePostings.length === 0 && data.missingSourceReferences.length === 0;
    return dto;
  }
}
