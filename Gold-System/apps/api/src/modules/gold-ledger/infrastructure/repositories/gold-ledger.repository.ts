import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../../database/prisma.service';
import {
  GoldLedgerJournalEntity,
  GoldLedgerEntryEntity,
} from '../../domain/entities/gold-ledger-journal.entity';

type GoldJournalRow = Prisma.GoldLedgerJournalGetPayload<{
  include: { entries: true };
}>;
type GoldEntryRow = Prisma.GoldLedgerEntryGetPayload<Record<string, never>>;

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateGoldJournalInput {
  idempotencyKey: string;
  sourceType: string;
  sourceId: string;
  description?: string;
  postedByUserId?: string;
  entries: CreateGoldEntryInput[];
}

export interface CreateGoldEntryInput {
  accountCode: string;
  accountName: string;
  direction: 'IN' | 'OUT';
  quantity: Decimal;
  purity: Decimal;
  description?: string;
}

// ─── Repository ───────────────────────────────────────────────────────────────

@Injectable()
export class GoldLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Reads ──────────────────────────────────────────────────────────────────

  async findJournalById(id: string): Promise<GoldLedgerJournalEntity | null> {
    const row = await this.prisma.goldLedgerJournal.findUnique({
      where: { id },
      include: { entries: true },
    });
    return row ? this.toDomainJournal(row) : null;
  }

  async findJournalByIdempotencyKey(key: string): Promise<GoldLedgerJournalEntity | null> {
    const row = await this.prisma.goldLedgerJournal.findUnique({
      where: { idempotencyKey: key },
      include: { entries: true },
    });
    return row ? this.toDomainJournal(row) : null;
  }

  async findJournalsBySource(
    sourceType: string,
    sourceId: string,
  ): Promise<GoldLedgerJournalEntity[]> {
    const rows = await this.prisma.goldLedgerJournal.findMany({
      where: { sourceType, sourceId },
      include: { entries: true },
      orderBy: { postedAt: 'asc' },
    });
    return rows.map((r) => this.toDomainJournal(r));
  }

  async journalExists(idempotencyKey: string): Promise<boolean> {
    const count = await this.prisma.goldLedgerJournal.count({
      where: { idempotencyKey },
    });
    return count > 0;
  }

  /**
   * Calculates the net gold position for a given account code.
   * Net = SUM(IN entries) - SUM(OUT entries)
   * Returns Decimal to preserve precision.
   */
  async getAccountGoldBalance(accountCode: string): Promise<{
    totalIn: Decimal;
    totalOut: Decimal;
    netPosition: Decimal;
  }> {
    const inAgg = await this.prisma.goldLedgerEntry.aggregate({
      where: { accountCode, direction: 'IN' },
      _sum: { quantity: true },
    });
    const outAgg = await this.prisma.goldLedgerEntry.aggregate({
      where: { accountCode, direction: 'OUT' },
      _sum: { quantity: true },
    });

    const totalIn = new Decimal(inAgg._sum.quantity?.toString() ?? '0');
    const totalOut = new Decimal(outAgg._sum.quantity?.toString() ?? '0');
    const netPosition = totalIn.minus(totalOut);

    return { totalIn, totalOut, netPosition };
  }

  async findEntriesByAccount(
    accountCode: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<GoldLedgerEntryEntity[]> {
    const rows = await this.prisma.goldLedgerEntry.findMany({
      where: { accountCode },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    });
    return rows.map((r) => this.toDomainEntry(r));
  }

  async findAllJournals(opts: {
    limit?: number;
    offset?: number;
    sourceType?: string;
  }): Promise<{ journals: GoldLedgerJournalEntity[]; total: number }> {
    const where = opts.sourceType ? { sourceType: opts.sourceType } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.goldLedgerJournal.findMany({
        where,
        include: { entries: true },
        orderBy: { postedAt: 'desc' },
        take: opts.limit ?? 50,
        skip: opts.offset ?? 0,
      }),
      this.prisma.goldLedgerJournal.count({ where }),
    ]);
    return { journals: rows.map((r) => this.toDomainJournal(r)), total };
  }

  // ─── Writes ──────────────────────────────────────────────────────────────────

  /**
   * Creates a gold journal with all its entries atomically.
   * Unique constraint on idempotencyKey prevents duplicate postings.
   */
  async createJournalInTx(
    tx: Prisma.TransactionClient,
    input: CreateGoldJournalInput,
  ): Promise<GoldLedgerJournalEntity> {
    const row = await tx.goldLedgerJournal.create({
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
            direction: e.direction,
            quantity: e.quantity,
            purity: e.purity,
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
   * Returns GA-02 (Gold Obligation) journals for TRADE_CONFIRM
   * that do not have a corresponding confirmed Trade.
   * Indicates orphaned gold obligation entries.
   */
  async findGoldJournalsWithMissingTradeSource(): Promise<
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
      SELECT glj.id, glj.idempotency_key, glj.source_type, glj.source_id
      FROM gold_ledger_journals glj
      WHERE glj.source_type IN ('TRADE_CONFIRM', 'TRADE_REVERSAL')
        AND NOT EXISTS (
          SELECT 1 FROM trades t WHERE t.id = glj.source_id
        )
    `;

    return rows.map((r) => ({
      journalId: r.id,
      idempotencyKey: r.idempotency_key,
      sourceType: r.source_type,
      sourceId: r.source_id,
    }));
  }

  /**
   * Returns duplicate gold postings (same sourceType + sourceId has >1 journal).
   */
  async findDuplicateGoldPostings(): Promise<
    Array<{
      sourceType: string;
      sourceId: string;
      journalCount: number;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        source_type: string;
        source_id: string;
        journal_count: bigint;
      }>
    >`
      SELECT
        source_type,
        source_id,
        COUNT(*) AS journal_count
      FROM gold_ledger_journals
      GROUP BY source_type, source_id
      HAVING COUNT(*) > 1
    `;

    return rows.map((r) => ({
      sourceType: r.source_type,
      sourceId: r.source_id,
      journalCount: Number(r.journal_count),
    }));
  }

  // ─── Mappers ──────────────────────────────────────────────────────────────────

  private toDomainJournal(row: GoldJournalRow): GoldLedgerJournalEntity {
    return new GoldLedgerJournalEntity({
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

  private toDomainEntry(row: GoldEntryRow): GoldLedgerEntryEntity {
    return new GoldLedgerEntryEntity({
      id: row.id,
      journalId: row.journalId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      direction: row.direction as 'IN' | 'OUT',
      quantity: new Decimal(row.quantity.toString()),
      purity: new Decimal(row.purity.toString()),
      description: row.description,
      createdAt: row.createdAt,
    });
  }
}
