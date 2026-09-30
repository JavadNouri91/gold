import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

/**
 * Customer payment ledger.
 *
 * Payments are receipts against a confirmed trade. There is no payment-type
 * column, gateway, or refund record. Buy/sell is read from the related order
 * item metadata, the same source the trades page uses.
 *
 * Pending receipts are accounting work in progress and are excluded from this
 * ledger. They are not a customer "awaiting payment" queue.
 */

export type PaymentStatusGroup = 'successful' | 'failed' | 'reversed' | 'submitted';
export type PaymentLedgerType = 'BUY' | 'SELL' | 'OTHER';

export const SUCCESSFUL_PAYMENT_STATUSES = ['VALIDATED', 'ALLOCATED', 'COMPLETED'] as const;

const MAX_RANGE_MS = 366 * 5 * 24 * 60 * 60 * 1000;

export interface LedgerQueryInput {
  from?: string;
  to?: string;
  statusGroup?: PaymentStatusGroup;
  type?: PaymentLedgerType;
  q?: string;
}

export interface LedgerBounds {
  from: Date;
  to: Date;
  statusGroup?: PaymentStatusGroup;
  type?: PaymentLedgerType;
  q?: string;
}

export function parseLedgerBounds(query: LedgerQueryInput): LedgerBounds {
  if (!query.from || !query.to) {
    throw new BadRequestException('بازه زمانی نامعتبر است');
  }
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new BadRequestException('بازه زمانی نامعتبر است');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new BadRequestException('بازه زمانی نامعتبر است');
  }
  const q = query.q?.trim();
  return {
    from,
    to,
    statusGroup: query.statusGroup,
    type: query.type,
    q: q ? q.slice(0, 80) : undefined,
  };
}

function sideClause(side: 'BUY' | 'SELL'): Prisma.PaymentWhereInput {
  return {
    trade: {
      order: {
        items: {
          some: {
            metadata: { path: ['side'], equals: side },
          },
        },
      },
    },
  };
}

/**
 * Customer id always comes from the caller, never from the query string.
 * An unfiltered list includes receipts waiting for accountant confirmation.
 */
export function customerLedgerWhere(
  customerId: string,
  bounds: LedgerBounds,
  options?: { ignoreStatusGroup?: boolean },
): Prisma.PaymentWhereInput {
  const statusGroup = options?.ignoreStatusGroup ? undefined : bounds.statusGroup;
  const status: Prisma.EnumPaymentStatusFilter | undefined = statusGroup
    ? {
        in:
          statusGroup === 'successful'
            ? [...SUCCESSFUL_PAYMENT_STATUSES]
            : statusGroup === 'failed'
              ? ['FAILED']
              : statusGroup === 'reversed'
                ? ['REVERSED']
                : ['PENDING'],
      }
    : undefined;

  const filters: Prisma.PaymentWhereInput[] = [
    { customerId },
    { createdAt: { gte: bounds.from, lte: bounds.to } },
  ];
  if (status) filters.push({ status });

  if (bounds.type === 'BUY' || bounds.type === 'SELL') {
    filters.push(sideClause(bounds.type));
  } else if (bounds.type === 'OTHER') {
    filters.push({ NOT: { OR: [sideClause('BUY'), sideClause('SELL')] } });
  }

  if (bounds.q) {
    filters.push({
      OR: [
        { id: { contains: bounds.q, mode: 'insensitive' } },
        { referenceNumber: { contains: bounds.q, mode: 'insensitive' } },
        { trade: { tradeNumber: { contains: bounds.q, mode: 'insensitive' } } },
        { trade: { order: { orderNumber: { contains: bounds.q, mode: 'insensitive' } } } },
      ],
    });
  }

  return { AND: filters };
}

export interface AmountCount {
  count: number;
  amountRial: string;
}

export interface PaymentSummary {
  totalPaid: AmountCount;
  successful: AmountCount;
  failed: AmountCount;
  reversed: AmountCount;
  hasAny: boolean;
}

interface SummaryBucket {
  count: number;
  amount: Decimal;
}

function emptyBucket(): SummaryBucket {
  return { count: 0, amount: new Decimal(0) };
}

function publishBucket(bucket: SummaryBucket): AmountCount {
  return { count: bucket.count, amountRial: bucket.amount.toFixed(2) };
}

export function foldPaymentSummary(
  groups: Array<{ status: string; count: number; amount: string | null }>,
  hasAny: boolean,
): PaymentSummary {
  const successful = emptyBucket();
  const failed = emptyBucket();
  const reversed = emptyBucket();

  for (const group of groups) {
    const amount = new Decimal(group.amount && group.amount !== '' ? group.amount : 0);
    const target = (SUCCESSFUL_PAYMENT_STATUSES as readonly string[]).includes(group.status)
      ? successful
      : group.status === 'FAILED'
        ? failed
        : group.status === 'REVERSED'
          ? reversed
          : null;
    if (!target) continue;
    target.count += group.count;
    target.amount = target.amount.plus(amount);
  }

  return {
    totalPaid: publishBucket({
      count: successful.count + failed.count,
      amount: successful.amount.plus(failed.amount),
    }),
    successful: publishBucket(successful),
    failed: publishBucket(failed),
    reversed: publishBucket(reversed),
    hasAny,
  };
}

export function readPaymentSide(metadata: unknown): 'BUY' | 'SELL' | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const side = (metadata as { side?: unknown }).side;
  return side === 'BUY' || side === 'SELL' ? side : null;
}
