import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../../database/prisma.service';
import {
  FinancialLedgerJournalEntity,
  FinancialLedgerEntryEntity,
} from '../../domain/entities/financial-ledger-journal.entity';

type JournalRow = Prisma.FinancialLedgerJournalGetPayload<{
  include: { entries: true };
}>;
type EntryRow = Prisma.FinancialLedgerEntryGetPayload<Record<string, never>>;

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateJournalInput {
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
  description?: string;
  postedByUserId?: string;
  entries: CreateEntryInput[];
}

export interface CreateEntryInput {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: Decimal;
  credit: Decimal;
  currency?: string;
  description?: string;
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class FinancialLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ──────────────────────────────────────────────────────────────────

  async findJournalById(id: string): Promise<FinancialLedgerJournalEntity | null> {
    const row = await this.prisma.financialLedgerJournal.findUnique({
      where: { id },
      include: { entries: true },
    });
    return row ? this.toDomainJournal(row) : null;
  }

  async findJournalByIdempotencyKey(key: string): Promise<FinancialLedgerJournalEntity | null> {
    const row = await this.prisma.financialLedgerJournal.findUnique({
      where: { idempotencyKey: key },
      include: { entries: true },
    });
    return row ? this.toDomainJournal(row) : null;
  }

  async findJournalsBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<FinancialLedgerJournalEntity[]> {
    const rows = await this.prisma.financialLedgerJournal.findMany({
      where: { sourceType, sourceId },
      include: { entries: true },
      orderBy: { postedAt: 'asc' },
    });
    return rows.map((r) => this.toDomainJournal(r));
  }

  /**
   * Returns all entries for a given account code, newest first.
   */
  async findEntriesByAccount(
    accountCode: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<FinancialLedgerEntryEntity[]> {
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: { accountCode },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.toDomainEntry(r));
  }

  /**
   * Calculates account balance: sum(debits) - sum(credits).
   * Uses Prisma aggregate (Decimal-safe).
   */
  async getAccountBalance(
    accountCode: string,
  ): Promise<{ totalDebit: Decimal; totalCredit: Decimal; balance: Decimal }> {
    const agg = await this.prisma.financialLedgerEntry.aggregate({
      where: { accountCode },
      _sum: { debit: true, credit: true },
    });

    const totalDebit = new Decimal(agg._sum.debit?.toString() ?? '0');
    const totalCredit = new Decimal(agg._sum.credit?.toString() ?? '0');
    const balance = totalDebit.minus(totalCredit);

    return { totalDebit, totalCredit, balance };
  }

  /**
   * Checks whether a journal with the given idempotency key already exists.
   * Used for fast idempotency pre-check.
   */
  async journalExists(idempotencyKey: string): Promise<boolean> {
    const count = await this.prisma.financialLedgerJournal.count({
      where: { idempotencyKey },
    });
    return count > 0;
  }

  /**
   * Returns all journals ordered by postedAt descending.
   */
  async findAllJournals(opts: {
    limit?: number;
    offset?: number;
    sourceType?: string;
  }): Promise<{ journals: FinancialLedgerJournalEntity[]; total: number }> {
    const where = opts.sourceType ? { sourceType: opts.sourceType } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.financialLedgerJournal.findMany({
        where,
        include: { entries: true },
        orderBy: { postedAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
      }),
      this.prisma.financialLedgerJournal.count({ where }),
    ]);
    return { journals: rows.map((r) => this.toDomainJournal(r)), total };
  }

  // ─── Writes ──────────────────────────────────────────────────────────────────

  /**
   * Creates a journal with all its entries in a single atomic operation.
   * The unique constraint on idempotencyKey prevents duplicate postings.
   *
   * CRITICAL: Must be called inside a Prisma transaction when coordinating
   * with other business entity mutations (e.g., Trade confirmation).
   */
  async createJournalInTx(
    tx: Prisma.TransactionClient,
    input: CreateJournalInput,
  ): Promise<FinancialLedgerJournalEntity> {
    const row = await tx.financialLedgerJournal.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        description: input.description ?? null,
        postedByUserId: input.postedByUserId ?? null,
        entries: {
          create: input.entries.map((e) => ({
            accountCode: e.accountCode,
            accountName: e.accountName,
            accountType: e.accountType,
            debit: e.debit,
            credit: e.credit,
            currency: e.currency ?? 'IRR',
            description: e.description ?? null,
          })),
        },
      },
      include: { entries: true },
    });

    return this.toDomainJournal(row);
  }

  // ─── Reconciliation Queries ───────────────────────────────────────────────────

  /**
   * Returns journals where sum(debit) ≠ sum(credit) — i.e., unbalanced postings.
   * These represent data integrity violations that must be reviewed.
   * This should never return results in a healthy system.
   */
  async findUnbalancedJournals(): Promise<
    Array<{
      journalId: string;
      idempotencyKey: string;
      sourceType: string;
      sourceId: string;
      totalDebit: Decimal;
      totalCredit: Decimal;
      imbalance: Decimal;
    }>
  > {
    // Aggregate per journal in PostgreSQL
    const rows = await this.prisma.$queryRaw<
      Array<{
        journal_id: string;
        idempotency_key: string;
        source_type: string;
        source_id: string;
        total_debit: string;
        total_credit: string;
      }>
    >`
      SELECT
        fle.journal_id,
        flj.idempotency_key,
        flj.source_type,
        flj.source_id,
        SUM(fle.debit) AS total_debit,
        SUM(fle.credit) AS total_credit
      FROM financial_ledger_entries fle
      JOIN financial_ledger_journals flj ON flj.id = fle.journal_id
      GROUP BY fle.journal_id, flj.idempotency_key, flj.source_type, flj.source_id
      HAVING SUM(fle.debit) != SUM(fle.credit)
    `;

    return rows.map((r) => {
      const totalDebit = new Decimal(r.total_debit);
      const totalCredit = new Decimal(r.total_credit);
      return {
        journalId: r.journal_id,
        idempotencyKey: r.idempotency_key,
        sourceType: r.source_type,
        sourceId: r.source_id,
        totalDebit,
        totalCredit,
        imbalance: totalDebit.minus(totalCredit).abs(),
      };
    });
  }

  /**
   * Returns (sourceType, sourceId) combinations that have more than one journal.
   * Indicates potential duplicate postings for the same business event.
   */
  async findDuplicateSourcePostings(): Promise<
    Array<{
      sourceType: string;
      sourceId: string;
      journalCount: number;
      journalIds: string[];
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_type: string;
        source_id: string;
        journal_count: bigint;
        journal_ids: string[];
      }>
    >`
      SELECT
        source_type,
        source_id,
        COUNT(*) AS journal_count,
        ARRAY_AGG(id) AS journal_ids
      FROM financial_ledger_journals
      GROUP BY source_type, source_id
      HAVING COUNT(*) > 1
    `;

    return rows.map((r) => ({
      sourceType: r.source_type,
      sourceId: r.source_id,
      journalCount: Number(r.journal_count),
      journalIds: Array.isArray(r.journal_ids)
        ? r.journal_ids
        : [r.journal_ids as unknown as string],
    }));
  }

  /**
   * Returns journals where sourceId does not correspond to any existing Trade,
   * Payment, or other source entity.
   * NOTE: Currently checks only TRADE_CONFIRM and TRADE_REVERSAL source types.
   */
  async findJournalsWithMissingTradeSource(): Promise<
    Array<{
      journalId: string;
      idempotencyKey: string;
      sourceType: string;
      sourceId: string;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        idempotency_key: string;
        source_type: string;
        source_id: string;
      }>
    >`
      SELECT flj.id, flj.idempotency_key, flj.source_type, flj.source_id
      FROM financial_ledger_journals flj
      WHERE flj.source_type IN ('TRADE_CONFIRM', 'TRADE_REVERSAL')
        AND NOT EXISTS (
          SELECT 1 FROM trades t WHERE t.id = flj.source_id
        )
    `;

    return rows.map((r) => ({
      journalId: r.id,
      idempotencyKey: r.idempotency_key,
      sourceType: r.source_type,
      sourceId: r.source_id,
    }));
  }

  // ─── Mappers ──────────────────────────────────────────────────────────────────

  private toDomainJournal(row: JournalRow): FinancialLedgerJournalEntity {
    return new FinancialLedgerJournalEntity({
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      description: row.description,
      postedAt: row.postedAt,
      postedByUserId: row.postedByUserId,
      entries: row.entries.map((e) => this.toDomainEntry(e)),
    });
  }

  private toDomainEntry(row: EntryRow): FinancialLedgerEntryEntity {
    return new FinancialLedgerEntryEntity({
      id: row.id,
      journalId: row.journalId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      debit: new Decimal(row.debit.toString()),
      credit: new Decimal(row.credit.toString()),
      currency: row.currency,
      description: row.description,
      createdAt: row.createdAt,
    });
  }
}
