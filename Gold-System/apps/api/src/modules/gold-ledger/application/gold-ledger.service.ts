import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import {
  GoldLedgerJournalEntity,
  GoldLedgerEntryEntity,
} from '../domain/entities/gold-ledger-journal.entity';
import {
  GOLD_ACCOUNTS,
  getGoldAccount,
  assertGoldAccountActive,
} from '../domain/constants/gold-accounts';
import {
  InvalidGoldQuantityException,
  GoldLedgerJournalNotFoundException,
} from '../domain/exceptions/gold-ledger.exceptions';
import { GoldLedgerRepository } from '../infrastructure/repositories/gold-ledger.repository';
import {
  GoldAccountBalanceResponseDto,
  GoldReconciliationReportDto,
} from './dto/gold-ledger-response.dto';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface PostGoldEntryInput {
  accountCode: string;
  direction: 'IN' | 'OUT';
  quantity: Decimal;
  purity: Decimal;
  description?: string;
}

export interface PostGoldJournalInput {
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
  description?: string;
  postedByUserId?: string;
  entries: PostGoldEntryInput[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Gold Ledger Service
 *
 * Records actual gold weight movements on store-level gold accounts.
 * All quantities stored as Decimal — BR-P05 (never Float).
 *
 * GOLD ACCOUNTS (docs/21-business-decisions.md §6.2):
 * - GA-01: Store Gold Position — gold purchased from upstream
 * - GA-02: Gold Obligation to Customer — gold committed via confirmed Trade
 * - GA-03: Gold Reversal / Adjustment
 *
 * IMPORTANT: Customer gold capacity is Rial-based (CustomerAccount.credit_limit_gold_rial).
 * GoldLedgerEntry records physical/contractual gold movements ONLY.
 *
 * BLOCKED at Trade Confirmation:
 * - GA-01 posting — when GA-01 should change at Trade confirmation vs delivery is
 *   NOT documented. open-questions.md #39 is OPEN.
 *   Only GA-02 (obligation creation) is posted at Trade confirmation.
 *
 * Source: docs/13-credit-and-gold-ledger.md, docs/21-business-decisions.md §6.2
 */
@Injectable()
export class GoldLedgerService {
  private readonly logger = new Logger(GoldLedgerService.name);

  constructor(private readonly repo: GoldLedgerRepository) {}

  // ─── Read Operations ─────────────────────────────────────────────────────────

  async getJournalById(id: string): Promise<GoldLedgerJournalEntity> {
    const journal = await this.repo.findJournalById(id);
    if (!journal) throw new GoldLedgerJournalNotFoundException(id);
    return journal;
  }

  async getJournalsBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<GoldLedgerJournalEntity[]> {
    return this.repo.findJournalsBySource(sourceType, sourceId);
  }

  async getAccountBalance(accountCode: string): Promise<GoldAccountBalanceResponseDto> {
    getGoldAccount(accountCode); // throws if unknown
    const bal = await this.repo.getAccountGoldBalance(accountCode);
    return GoldAccountBalanceResponseDto.fromData({
      accountCode,
      ...bal,
    });
  }

  async getAllAccountBalances(): Promise<GoldAccountBalanceResponseDto[]> {
    const results: GoldAccountBalanceResponseDto[] = [];
    for (const code of Object.keys(GOLD_ACCOUNTS)) {
      const account = GOLD_ACCOUNTS[code];
      if (!account.active) continue;
      const bal = await this.repo.getAccountGoldBalance(code);
      results.push(GoldAccountBalanceResponseDto.fromData({ accountCode: code, ...bal }));
    }
    return results;
  }

  async listJournals(opts: { limit?: number; offset?: number; sourceType?: string }) {
    return this.repo.findAllJournals(opts);
  }

  // ─── Write Operations ─────────────────────────────────────────────────────────

  /**
   * Posts a gold journal (all entries atomically) within an existing transaction.
   *
   * GUARANTEES:
   * 1. Validates all account codes against Gold Accounts (GA-01..GA-03 only)
   * 2. Validates active accounts (no BLOCKED/DEFERRED accounts)
   * 3. Validates quantities are positive Decimal
   * 4. Idempotency: if idempotencyKey exists → returns existing (no-op)
   * 5. Atomicity: all entries written in the provided transaction
   *
   * @param tx     Prisma transaction client
   * @param input  Journal data
   */
  async postJournalInTx(
    tx: Prisma.TransactionClient,
    input: PostGoldJournalInput,
  ): Promise<{ journal: GoldLedgerJournalEntity; wasAlreadyPosted: boolean }> {
    // ── Idempotency check (inside tx for concurrency safety) ──────────────────
    const existing = await tx.goldLedgerJournal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { entries: true },
    });

    if (existing) {
      this.logger.warn(
        `[GoldLedger] Idempotency key "${input.idempotencyKey}" already exists — skipping duplicate posting`,
      );
      return {
        journal: this.mapJournalRow(existing),
        wasAlreadyPosted: true,
      };
    }

    // ── Validate accounts & quantities ────────────────────────────────────────
    const resolvedEntries: Array<{
      accountCode: string;
      accountName: string;
      direction: 'IN' | 'OUT';
      quantity: Decimal;
      purity: Decimal;
      description: string | undefined;
    }> = [];

    for (const entry of input.entries) {
      const account = getGoldAccount(entry.accountCode);
      assertGoldAccountActive(entry.accountCode);

      if (!entry.quantity.greaterThan(0)) {
        throw new InvalidGoldQuantityException(entry.quantity.toString());
      }

      resolvedEntries.push({
        accountCode: account.code,
        accountName: account.name,
        direction: entry.direction,
        quantity: entry.quantity,
        purity: entry.purity,
        description: entry.description,
      });
    }

    // ── Write journal + entries ───────────────────────────────────────────────
    const journal = await this.repo.createJournalInTx(tx, {
      idempotencyKey: input.idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      postedByUserId: input.postedByUserId,
      entries: resolvedEntries,
    });

    this.logger.log(
      `[GoldLedger] Journal posted: ${journal.id} ` + `(${input.sourceType}:${input.sourceId})`,
    );

    return { journal, wasAlreadyPosted: false };
  }

  // ─── Reconciliation ───────────────────────────────────────────────────────────

  /**
   * Runs gold ledger reconciliation.
   * NEVER modifies data — reports inconsistencies only.
   */
  async reconcile(): Promise<GoldReconciliationReportDto> {
    const [duplicates, missingSources] = await Promise.all([
      this.repo.findDuplicateGoldPostings(),
      this.repo.findGoldJournalsWithMissingTradeSource(),
    ]);

    // Collect balances for all active accounts
    const accountBalances: Array<{ accountCode: string; netPosition: Decimal }> = [];
    for (const code of Object.keys(GOLD_ACCOUNTS)) {
      if (!GOLD_ACCOUNTS[code].active) continue;
      const bal = await this.repo.getAccountGoldBalance(code);
      accountBalances.push({ accountCode: code, netPosition: bal.netPosition });
    }

    if (duplicates.length > 0) {
      this.logger.warn(
        `[GoldLedger] RECONCILIATION: ${duplicates.length} duplicate gold posting(s) detected.`,
      );
    }

    return GoldReconciliationReportDto.build({
      duplicatePostings: duplicates,
      missingSourceReferences: missingSources,
      accountBalances,
    });
  }

  // ─── Internal Helper ─────────────────────────────────────────────────────────

  private mapJournalRow(row: {
    id: string;
    idempotencyKey: string;
    sourceType: string;
    sourceId: string;
    description: string | null;
    postedAt: Date;
    postedByUserId: string | null;
    entries: Array<{
      id: string;
      journalId: string;
      accountCode: string;
      accountName: string;
      direction: string;
      quantity: Decimal | string | number | { toString(): string };
      purity: Decimal | string | number | { toString(): string };
      description: string | null;
      createdAt: Date;
    }>;
  }): GoldLedgerJournalEntity {
    return new GoldLedgerJournalEntity({
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      description: row.description,
      postedAt: row.postedAt,
      postedByUserId: row.postedByUserId,
      entries: row.entries.map(
        (e) =>
          new GoldLedgerEntryEntity({
            id: e.id,
            journalId: e.journalId,
            accountCode: e.accountCode,
            accountName: e.accountName,
            direction: e.direction as 'IN' | 'OUT',
            quantity: new Decimal(e.quantity.toString()),
            purity: new Decimal(e.purity.toString()),
            description: e.description,
            createdAt: e.createdAt,
          }),
      ),
    });
  }
}
