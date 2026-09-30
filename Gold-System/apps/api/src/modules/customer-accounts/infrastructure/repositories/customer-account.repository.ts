import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { CustomerAccountEntity } from '../../domain/entities/customer-account.entity';
import { InsufficientCreditException } from '../../../orders/domain/exceptions/order.exceptions';
import Decimal from 'decimal.js';
import { Prisma, CreditTransactionType } from '@prisma/client';

type AccountRow = Prisma.CustomerAccountGetPayload<Record<string, never>>;

export interface StoredCreditTransaction {
  id: string;
  type: string;
  creditPool: string;
  amount: Decimal;
  balanceAfter: Decimal;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  createdAt: Date;
}

@Injectable()
export class CustomerAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCustomerId(customerId: string): Promise<CustomerAccountEntity | null> {
    const row = await this.prisma.customerAccount.findUnique({
      where: { customerId },
    });
    return row ? this.toDomain(row) : null;
  }

  async findById(id: string): Promise<CustomerAccountEntity | null> {
    const row = await this.prisma.customerAccount.findUnique({
      where: { id },
    });
    return row ? this.toDomain(row) : null;
  }

  /**
   * Create account on customer approval.
   * All credits start at 0 — Manager grants credit separately (UC-05).
   */
  async createForCustomer(customerId: string): Promise<CustomerAccountEntity> {
    const row = await this.prisma.customerAccount.create({
      data: {
        customerId,
        status: 'ACTIVE',
        creditLimitRial: new Decimal(0),
        reservedCreditRial: new Decimal(0),
        consumedCreditRial: new Decimal(0),
        creditLimitGoldRial: new Decimal(0),
        reservedCreditGoldRial: new Decimal(0),
        consumedCreditGoldRial: new Decimal(0),
      },
    });
    return this.toDomain(row);
  }

  /**
   * Grant / top-up credit with an immutable transaction record.
   * BR-C04: actor and reason are mandatory.
   * All operations are atomic.
   */
  async grantCredit(params: {
    accountId: string;
    pool: 'RIAL' | 'GOLD_RIAL';
    amount: Decimal;
    reason: string;
    actorId: string;
    sourceType?: string;
    sourceId?: string;
  }): Promise<CustomerAccountEntity> {
    const { accountId, pool, amount, reason, actorId } = params;

    if (amount.lte(0)) {
      throw new Error('Credit grant amount must be positive');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const account = await tx.customerAccount.findUnique({
        where: { id: accountId },
      });
      if (!account) throw new Error(`CustomerAccount ${accountId} not found`);

      let newLimit: Decimal;
      let updateField: Record<string, Decimal>;

      if (pool === 'RIAL') {
        newLimit = new Decimal(account.creditLimitRial.toString()).plus(amount);
        updateField = { creditLimitRial: newLimit };
      } else {
        newLimit = new Decimal(account.creditLimitGoldRial.toString()).plus(amount);
        updateField = { creditLimitGoldRial: newLimit };
      }

      const updatedRow = await tx.customerAccount.update({
        where: { id: accountId },
        data: { ...updateField, updatedAt: new Date() },
      });

      // Immutable credit transaction record
      await tx.creditTransaction.create({
        data: {
          accountId,
          type: CreditTransactionType.GRANT,
          creditPool: pool,
          amount,
          balanceAfter: newLimit,
          reason,
          createdBy: actorId,
          sourceType: params.sourceType ?? 'MANUAL',
          sourceId: params.sourceId ?? null,
        },
      });

      return updatedRow;
    });

    return this.toDomain(updated);
  }

  /**
   * Reserves credit for an Order submission.
   *
   * CONCURRENCY: Uses SELECT FOR UPDATE (PostgreSQL row-level lock) to prevent
   * two concurrent requests from oversubscribing the same credit pool.
   *
   * Scenario: Two simultaneous order submissions for 60M each, credit limit = 100M.
   *   Transaction 1 → acquires FOR UPDATE lock → sees 100M available → reserves 60M → commits
   *   Transaction 2 → waits for T1 lock release → sees 40M available → 60M > 40M → throws InsufficientCreditException
   *
   * ATOMICITY: Must be called inside the SAME Prisma transaction as the order status update,
   * so both the credit increment and the order status change commit or roll back together.
   *
   * docs/21-business-decisions.md §3.3, §3.4
   */
  async reserveCredit(params: {
    tx: Prisma.TransactionClient;
    customerId: string;
    amount: Decimal;
    orderId: string;
    actorId: string;
  }): Promise<void> {
    const { tx, customerId, amount, orderId, actorId } = params;

    if (amount.lte(0)) {
      throw new Error('Credit reservation amount must be positive');
    }

    // SELECT FOR UPDATE — locks the row until this transaction commits.
    // This is the critical section that prevents concurrent oversubscription.
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        credit_limit_rial: Prisma.Decimal;
        reserved_credit_rial: Prisma.Decimal;
        consumed_credit_rial: Prisma.Decimal;
      }>
    >`
      SELECT id, credit_limit_rial, reserved_credit_rial, consumed_credit_rial
      FROM customer_accounts
      WHERE customer_id = ${customerId}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error(`CustomerAccount for customer ${customerId} not found`);
    }

    const row = rows[0];
    const limit = new Decimal(row.credit_limit_rial.toString());
    const reserved = new Decimal(row.reserved_credit_rial.toString());
    const consumed = new Decimal(row.consumed_credit_rial.toString());
    const available = limit.minus(reserved).minus(consumed);

    // Hard block — no override permitted (§3.4)
    if (amount.gt(available)) {
      throw new InsufficientCreditException(available, amount);
    }

    // Atomic increment inside the locked transaction
    await tx.$executeRaw`
      UPDATE customer_accounts
      SET reserved_credit_rial = reserved_credit_rial + ${amount}::numeric,
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    // Immutable credit transaction record (§3.3 — write-once ledger)
    const balanceAfter = available.minus(amount);
    await tx.creditTransaction.create({
      data: {
        accountId: row.id,
        type: CreditTransactionType.RESERVATION,
        creditPool: 'RIAL',
        amount,
        balanceAfter,
        sourceType: 'ORDER',
        sourceId: orderId,
        createdBy: actorId,
        reason: `Credit reserved for order submission`,
      },
    });
  }

  /**
   * Releases previously reserved credit.
   *
   * Called when an Order is CANCELLED or REJECTED — §3.5.
   *
   * CONCURRENCY: Uses SELECT FOR UPDATE to prevent concurrent modifications
   * to the same account during release.
   *
   * ATOMICITY: Must be called inside the SAME Prisma transaction as the order
   * status update (CANCELLED/REJECTED), ensuring the release and status change
   * are committed together or rolled back together.
   *
   * IDEMPOTENCY: The amount to release is taken from Order.reservedAmountRial
   * (the exact amount reserved at submission), not recalculated. This prevents
   * releasing more or less than was originally reserved.
   *
   * docs/21-business-decisions.md §3.5
   */
  async releaseCredit(params: {
    tx: Prisma.TransactionClient;
    customerId: string;
    amount: Decimal;
    orderId: string;
    actorId: string;
    reason: string;
  }): Promise<void> {
    const { tx, customerId, amount, orderId, actorId, reason } = params;

    if (amount.lte(0)) {
      throw new Error('Credit release amount must be positive');
    }

    // SELECT FOR UPDATE — prevents concurrent modification of this account
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        credit_limit_rial: Prisma.Decimal;
        reserved_credit_rial: Prisma.Decimal;
        consumed_credit_rial: Prisma.Decimal;
      }>
    >`
      SELECT id, credit_limit_rial, reserved_credit_rial, consumed_credit_rial
      FROM customer_accounts
      WHERE customer_id = ${customerId}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error(`CustomerAccount for customer ${customerId} not found`);
    }

    const row = rows[0];
    const reserved = new Decimal(row.reserved_credit_rial.toString());

    // Guard: never go below zero — indicates a bug (double-release attempt)
    if (amount.gt(reserved)) {
      throw new Error(
        `Cannot release ${amount.toFixed(2)} Rial from account with only ` +
          `${reserved.toFixed(2)} Rial reserved. Possible double-release bug for order ${orderId}.`,
      );
    }

    // Atomic decrement inside the locked transaction
    await tx.$executeRaw`
      UPDATE customer_accounts
      SET reserved_credit_rial = reserved_credit_rial - ${amount}::numeric,
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    // Compute new available balance for the audit record
    const limit = new Decimal(row.credit_limit_rial.toString());
    const consumed = new Decimal(row.consumed_credit_rial.toString());
    const newReserved = reserved.minus(amount);
    const balanceAfter = limit.minus(newReserved).minus(consumed);

    // Immutable credit release record (§3.5 — write-once ledger, never deleted)
    await tx.creditTransaction.create({
      data: {
        accountId: row.id,
        type: CreditTransactionType.RELEASE,
        creditPool: 'RIAL',
        amount,
        balanceAfter,
        sourceType: 'ORDER',
        sourceId: orderId,
        createdBy: actorId,
        reason,
      },
    });
  }

  /**
   * Consumes previously reserved credit at Trade confirmation.
   *
   * §3.3: Credit lifecycle — reserved → consumed at the moment a Trade is confirmed.
   *
   * CONCURRENCY: Uses SELECT FOR UPDATE to prevent concurrent modification of
   * the same account during consumption. Two simultaneous confirmation attempts
   * will serialize here; the second sees the already-decremented reserved balance.
   *
   * ATOMICITY: Must be called inside the SAME Prisma transaction as Trade creation
   * and Order status update (APPROVED → TRADE_CREATED), so credit move and Trade
   * commit or roll back together.
   *
   * INVARIANT: consumeCredit() must only be called after reserveCredit() has
   * previously reserved the same amount for the same orderId.
   */
  async consumeCredit(params: {
    tx: Prisma.TransactionClient;
    customerId: string;
    amount: Decimal;
    tradeId: string;
    orderId: string;
    actorId: string;
  }): Promise<void> {
    const { tx, customerId, amount, tradeId, orderId, actorId } = params;

    if (amount.lte(0)) {
      throw new Error('Credit consumption amount must be positive');
    }

    // SELECT FOR UPDATE — serializes concurrent confirmations for the same account
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        credit_limit_rial: Prisma.Decimal;
        reserved_credit_rial: Prisma.Decimal;
        consumed_credit_rial: Prisma.Decimal;
      }>
    >`
      SELECT id, credit_limit_rial, reserved_credit_rial, consumed_credit_rial
      FROM customer_accounts
      WHERE customer_id = ${customerId}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error(`CustomerAccount for customer ${customerId} not found`);
    }

    const row = rows[0];
    const reserved = new Decimal(row.reserved_credit_rial.toString());
    const consumed = new Decimal(row.consumed_credit_rial.toString());

    // Guard: can only consume what was previously reserved
    if (amount.gt(reserved)) {
      throw new Error(
        `Cannot consume ${amount.toFixed(2)} Rial — only ${reserved.toFixed(2)} Rial is reserved ` +
          `for customer ${customerId} (order ${orderId}). ` +
          'reserveCredit() must be called before consumeCredit().',
      );
    }

    // Atomic: move amount from reserved → consumed
    await tx.$executeRaw`
      UPDATE customer_accounts
      SET reserved_credit_rial = reserved_credit_rial - ${amount}::numeric,
          consumed_credit_rial = consumed_credit_rial + ${amount}::numeric,
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    // Compute new available balance for the audit record
    const limit = new Decimal(row.credit_limit_rial.toString());
    const newConsumed = consumed.plus(amount);
    const newReserved = reserved.minus(amount);
    const balanceAfter = limit.minus(newReserved).minus(newConsumed);

    // Immutable consumption record (§3.3 — write-once ledger)
    await tx.creditTransaction.create({
      data: {
        accountId: row.id,
        type: CreditTransactionType.CONSUME,
        creditPool: 'RIAL',
        amount,
        balanceAfter,
        sourceType: 'TRADE',
        sourceId: tradeId,
        createdBy: actorId,
        reason: `Credit consumed at Trade confirmation (order ${orderId})`,
      },
    });
  }

  /**
   * Reverses a credit consumption after Trade reversal.
   *
   * §4.2: Trade reversal — credit moves back from consumed → available.
   *
   * CONCURRENCY: Uses SELECT FOR UPDATE.
   *
   * ATOMICITY: Must be called inside the SAME Prisma transaction as the Trade
   * status update (CONFIRMED → REVERSED).
   *
   * NOTE: Financial/Gold Ledger reversal entries are Phase 4. This method
   * only reverses the credit accounting.
   *
   * NOTE: The reversed credit becomes available again (not re-reserved),
   * so the customer's available balance increases.
   */
  async reverseConsumption(params: {
    tx: Prisma.TransactionClient;
    customerId: string;
    amount: Decimal;
    tradeId: string;
    actorId: string;
    reason: string;
  }): Promise<void> {
    const { tx, customerId, amount, tradeId, actorId, reason } = params;

    if (amount.lte(0)) {
      throw new Error('Reversal amount must be positive');
    }

    // SELECT FOR UPDATE — prevents concurrent modification
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        credit_limit_rial: Prisma.Decimal;
        reserved_credit_rial: Prisma.Decimal;
        consumed_credit_rial: Prisma.Decimal;
      }>
    >`
      SELECT id, credit_limit_rial, reserved_credit_rial, consumed_credit_rial
      FROM customer_accounts
      WHERE customer_id = ${customerId}
      FOR UPDATE
    `;

    if (rows.length === 0) {
      throw new Error(`CustomerAccount for customer ${customerId} not found`);
    }

    const row = rows[0];
    const consumed = new Decimal(row.consumed_credit_rial.toString());

    // Guard: can only reverse what was consumed
    if (amount.gt(consumed)) {
      throw new Error(
        `Cannot reverse ${amount.toFixed(2)} Rial — only ${consumed.toFixed(2)} Rial is consumed ` +
          `for customer ${customerId}. Possible double-reversal bug for trade ${tradeId}.`,
      );
    }

    // Atomic decrement — credit becomes available again
    await tx.$executeRaw`
      UPDATE customer_accounts
      SET consumed_credit_rial = consumed_credit_rial - ${amount}::numeric,
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    // Compute new available balance for the audit record
    const limit = new Decimal(row.credit_limit_rial.toString());
    const reserved = new Decimal(row.reserved_credit_rial.toString());
    const newConsumed = consumed.minus(amount);
    const balanceAfter = limit.minus(reserved).minus(newConsumed);

    // Immutable reversal record (§4.2 — write-once ledger)
    await tx.creditTransaction.create({
      data: {
        accountId: row.id,
        type: CreditTransactionType.REVERSAL,
        creditPool: 'RIAL',
        amount,
        balanceAfter,
        sourceType: 'TRADE',
        sourceId: tradeId,
        createdBy: actorId,
        reason,
      },
    });
  }

  /**
   * Read-only ledger for the signed-in customer's account.
   * Does not post, reserve, or recompute balances.
   */
  async listTransactionsByAccountId(
    accountId: string,
    limit: number,
  ): Promise<StoredCreditTransaction[]> {
    const rows = await this.prisma.creditTransaction.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      creditPool: row.creditPool,
      amount: new Decimal(row.amount.toString()),
      balanceAfter: new Decimal(row.balanceAfter.toString()),
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  }

  private toDomain(row: AccountRow): CustomerAccountEntity {
    return new CustomerAccountEntity({
      id: row.id,
      customerId: row.customerId,
      status: row.status,
      creditLimitRial: new Decimal(row.creditLimitRial.toString()),
      reservedCreditRial: new Decimal(row.reservedCreditRial.toString()),
      consumedCreditRial: new Decimal(row.consumedCreditRial.toString()),
      creditLimitGoldRial: new Decimal(row.creditLimitGoldRial.toString()),
      reservedCreditGoldRial: new Decimal(row.reservedCreditGoldRial.toString()),
      consumedCreditGoldRial: new Decimal(row.consumedCreditGoldRial.toString()),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
