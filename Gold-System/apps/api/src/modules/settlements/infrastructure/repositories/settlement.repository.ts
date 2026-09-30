import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../../database/prisma.service';
import { SettlementEntity } from '../../domain/entities/settlement.entity';
import { SettlementStatus } from '../../../payments/domain/constants/payment-methods';

/**
 * Settlement Repository
 *
 * One settlement record per Trade.
 * Tracks the total allocated amount and settlement status.
 *
 * Write operations MUST be performed inside a Prisma transaction
 * provided by the caller.
 */
@Injectable()
export class SettlementRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Read Operations ─────────────────────────────────────────────────────────

  async findByTradeId(tradeId: string): Promise<SettlementEntity | null> {
    const row = await this.prisma.settlement.findUnique({ where: { tradeId } });
    return row ? this.mapRow(row) : null;
  }

  async findById(id: string): Promise<SettlementEntity | null> {
    const row = await this.prisma.settlement.findUnique({ where: { id } });
    return row ? this.mapRow(row) : null;
  }

  // ─── Write Operations ─────────────────────────────────────────────────────────

  /**
   * Creates or updates the settlement record for a Trade.
   * Uses upsert to ensure exactly one settlement per Trade.
   *
   * Called after every payment allocation to keep the settlement state fresh.
   *
   * @param tx            Prisma transaction client (caller controls atomicity)
   * @param tradeId       Trade ID
   * @param settledAmount New running total of all allocations (Decimal)
   * @param tradeTotal    Trade total (for computing whether 100% is reached)
   * @param actorUserId   User performing the operation
   */
  async upsertSettlementInTx(
    tx: Prisma.TransactionClient,
    input: {
      tradeId: string;
      settledAmount: Decimal;
      tradeTotal: Decimal;
      actorUserId: string | null;
      notes?: string;
    },
  ): Promise<SettlementEntity> {
    const isFullyPaid = input.settledAmount.greaterThanOrEqualTo(input.tradeTotal);
    const now = new Date();

    const row = await tx.settlement.upsert({
      where: { tradeId: input.tradeId },
      create: {
        tradeId: input.tradeId,
        settledAmount: input.settledAmount.toFixed(2),
        status: isFullyPaid ? 'SETTLED' : 'PENDING',
        settledAt: isFullyPaid ? now : null,
        settledByUserId: isFullyPaid ? input.actorUserId : null,
        notes: input.notes ?? null,
      },
      update: {
        settledAmount: input.settledAmount.toFixed(2),
        status: isFullyPaid ? 'SETTLED' : 'PENDING',
        settledAt: isFullyPaid ? now : null,
        settledByUserId: isFullyPaid ? input.actorUserId : null,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });

    return this.mapRow(row);
  }

  // ─── Mapping Helper ───────────────────────────────────────────────────────────

  private mapRow(row: {
    id: string;
    tradeId: string;
    status: string;
    settledAmount: Decimal | string | number | { toString(): string };
    settledAt: Date | null;
    settledByUserId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): SettlementEntity {
    return new SettlementEntity({
      id: row.id,
      tradeId: row.tradeId,
      status: row.status as SettlementStatus,
      settledAmount: new Decimal(row.settledAmount.toString()),
      settledAt: row.settledAt,
      settledByUserId: row.settledByUserId,
      notes: row.notes,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
