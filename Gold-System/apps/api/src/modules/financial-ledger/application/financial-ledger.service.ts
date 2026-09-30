import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import {
  FinancialLedgerJournalEntity,
  FinancialLedgerEntryEntity,
} from '../domain/entities/financial-ledger-journal.entity';
import {
  FINANCIAL_ACCOUNTS,
  getAccount,
  assertAccountActive,
  AccountType,
} from '../domain/constants/chart-of-accounts';
import {
  UnbalancedTransactionException,
  InvalidEntryAmountException,
  LedgerJournalNotFoundException,
} from '../domain/exceptions/financial-ledger.exceptions';
import { FinancialLedgerRepository } from '../infrastructure/repositories/financial-ledger.repository';
import { ReconciliationReportDto } from './dto/ledger-response.dto';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface PostEntryInput {
  accountCode: string;
  debit: Decimal;
  credit: Decimal;
  description?: string;
  currency?: string;
}

export interface PostJournalInput {
  /** Unique key for this posting event — prevents duplicate postings. */
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
  description?: string;
  postedByUserId?: string;
  entries: PostEntryInput[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Financial Ledger Service
 *
 * Implements double-entry bookkeeping per docs/21-business-decisions.md §6.
 *
 * CRITICAL INVARIANTS:
 * 1. Every journal posting MUST balance: total debits = total credits
 * 2. Postings are WRITE-ONCE (no update/delete)
 * 3. Each posting has a unique idempotencyKey — duplicate postings are rejected
 * 4. All entries reference the Chart of Accounts (FA-01 … FA-15 only)
 * 5. BLOCKED accounts (FA-07, FA-09, FA-13) cannot be posted to
 *
 * BLOCKED POSTINGS (reported in final report, NOT silently skipped):
 * - FA-07 (Sales Profit): §13.2 — profit calculation base undefined
 * - FA-09 (Tax Payable): §13.3 — tax rate and taxable base undefined
 * - FA-13 (Supplier Settlement): §8.4 — deferred from MVP
 *
 * Source: docs/14-accounting.md, docs/21-business-decisions.md §6.1, §6.3
 */
@Injectable()
export class FinancialLedgerService {
  private readonly logger = new Logger(FinancialLedgerService.name);

  constructor(private readonly repo: FinancialLedgerRepository) {}

  // ─── Read Operations ─────────────────────────────────────────────────────────

  async getJournalById(id: string): Promise<FinancialLedgerJournalEntity> {
    const journal = await this.repo.findJournalById(id);
    if (!journal) throw new LedgerJournalNotFoundException(id);
    return journal;
  }

  async getJournalsBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<FinancialLedgerJournalEntity[]> {
    return this.repo.findJournalsBySource(sourceType, sourceId);
  }

  async getAccountBalance(accountCode: string) {
    // Validate the account exists in Chart of Accounts
    getAccount(accountCode); // throws if unknown
    return this.repo.getAccountBalance(accountCode);
  }

  async getAllAccountBalances(): Promise<
    Array<{
      accountCode: string;
      accountName: string;
      accountType: AccountType;
      totalDebit: Decimal;
      totalCredit: Decimal;
      balance: Decimal;
    }>
  > {
    const results = [];
    for (const code of Object.keys(FINANCIAL_ACCOUNTS)) {
      const account = FINANCIAL_ACCOUNTS[code];
      if (!account.active) continue; // skip BLOCKED/DEFERRED in balance report
      const bal = await this.repo.getAccountBalance(code);
      results.push({
        accountCode: code,
        accountName: account.name,
        accountType: account.type,
        ...bal,
      });
    }
    return results;
  }

  async listJournals(opts: { limit?: number; offset?: number; sourceType?: string }) {
    return this.repo.findAllJournals(opts);
  }

  // ─── Write Operations ─────────────────────────────────────────────────────────

  /**
   * Posts a balanced journal (all entries atomically) within an existing transaction.
   *
   * This is the primary posting interface used by business transaction handlers
   * (Trade confirmation, Trade reversal, etc.).
   *
   * GUARANTEES:
   * 1. Validates all account codes against Chart of Accounts
   * 2. Validates debits = credits before writing to DB
   * 3. Validates each entry has exactly one of debit/credit > 0
   * 4. Idempotency: if idempotencyKey already exists → returns existing journal (no-op)
   * 5. Atomicity: all entries written in the provided transaction (caller's tx)
   *
   * @param tx     Prisma transaction client — caller controls atomicity boundary
   * @param input  Journal data including idempotency key, source, and entries
   * @returns      The posted journal (or existing journal if idempotency key matched)
   */
  async postJournalInTx(
    tx: Prisma.TransactionClient,
    input: PostJournalInput,
  ): Promise<{ journal: FinancialLedgerJournalEntity; wasAlreadyPosted: boolean }> {
    // ── Idempotency check ──────────────────────────────────────────────────────
    // Check inside tx to prevent race conditions with simultaneous posts.
    const existing = await tx.financialLedgerJournal.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { entries: true },
    });

    if (existing) {
      this.logger.warn(
        `[FinancialLedger] Idempotency key "${input.idempotencyKey}" already exists — skipping duplicate posting`,
      );
      // Return existing journal without error — this is the idempotent path
      return {
        journal: this.mapJournalRow(existing),
        wasAlreadyPosted: true,
      };
    }

    // ── Validate accounts & entry amounts ─────────────────────────────────────
    const resolvedEntries: Array<{
      accountCode: string;
      accountName: string;
      accountType: string;
      debit: Decimal;
      credit: Decimal;
      currency: string;
      description: string | undefined;
    }> = [];

    for (const entry of input.entries) {
      // Account must exist in Chart of Accounts
      const account = getAccount(entry.accountCode); // throws UnknownAccountException

      // Account must be active (not BLOCKED/DEFERRED)
      assertAccountActive(entry.accountCode); // throws AccountNotActiveException

      // Entry invariant: exactly one of debit/credit > 0
      const hasDebit = entry.debit.greaterThan(0);
      const hasCredit = entry.credit.greaterThan(0);
      if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
        throw new InvalidEntryAmountException(entry.accountCode);
      }

      resolvedEntries.push({
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        debit: entry.debit,
        credit: entry.credit,
        currency: entry.currency ?? 'IRR',
        description: entry.description,
      });
    }

    // ── Double-entry balance check ─────────────────────────────────────────────
    const totalDebit = resolvedEntries.reduce((sum, e) => sum.plus(e.debit), new Decimal(0));
    const totalCredit = resolvedEntries.reduce((sum, e) => sum.plus(e.credit), new Decimal(0));

    if (!totalDebit.equals(totalCredit)) {
      throw new UnbalancedTransactionException(totalDebit.toFixed(2), totalCredit.toFixed(2));
    }

    // ── Write journal + entries atomically ────────────────────────────────────
    const journal = await this.repo.createJournalInTx(tx, {
      idempotencyKey: input.idempotencyKey,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      postedByUserId: input.postedByUserId,
      entries: resolvedEntries,
    });

    this.logger.log(
      `[FinancialLedger] Journal posted: ${journal.id} ` +
        `(${input.sourceType}:${input.sourceId}) ` +
        `DR=${totalDebit.toFixed(2)} CR=${totalCredit.toFixed(2)}`,
    );

    return { journal, wasAlreadyPosted: false };
  }

  // ─── Reconciliation ───────────────────────────────────────────────────────────

  /**
   * Runs ledger reconciliation and returns a report.
   *
   * IMPORTANT: This method NEVER modifies data. It reports inconsistencies only.
   * Corrections must go through controlled reversal entries.
   *
   * Reports:
   * 1. Unbalanced journals (DB integrity violation — should never happen)
   * 2. Duplicate source postings (same business event posted twice)
   * 3. Missing source references (entries pointing to non-existent Trade records)
   */
  async reconcile(): Promise<ReconciliationReportDto> {
    const [unbalanced, duplicates, missingSources] = await Promise.all([
      this.repo.findUnbalancedJournals(),
      this.repo.findDuplicateSourcePostings(),
      this.repo.findJournalsWithMissingTradeSource(),
    ]);

    if (unbalanced.length > 0) {
      this.logger.error(
        `[FinancialLedger] RECONCILIATION: ${unbalanced.length} unbalanced journal(s) detected. ` +
          `This indicates a data integrity violation.`,
      );
    }

    if (duplicates.length > 0) {
      this.logger.warn(
        `[FinancialLedger] RECONCILIATION: ${duplicates.length} duplicate source posting(s) detected.`,
      );
    }

    return ReconciliationReportDto.build({
      unbalancedJournals: unbalanced,
      duplicateSourcePostings: duplicates,
      missingSourceReferences: missingSources,
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
      accountType: string;
      debit: Decimal | string | number | { toString(): string };
      credit: Decimal | string | number | { toString(): string };
      currency: string;
      description: string | null;
      createdAt: Date;
    }>;
  }): FinancialLedgerJournalEntity {
    return new FinancialLedgerJournalEntity({
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      description: row.description,
      postedAt: row.postedAt,
      postedByUserId: row.postedByUserId,
      entries: row.entries.map(
        (e) =>
          new FinancialLedgerEntryEntity({
            id: e.id,
            journalId: e.journalId,
            accountCode: e.accountCode,
            accountName: e.accountName,
            accountType: e.accountType,
            debit: new Decimal(e.debit.toString()),
            credit: new Decimal(e.credit.toString()),
            currency: e.currency,
            description: e.description,
            createdAt: e.createdAt,
          }),
      ),
    });
  }
}
