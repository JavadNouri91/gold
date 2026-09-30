import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import { PaginationMeta } from '@gold/shared-types';
import { StorageService } from '../../../common/storage/storage.service';

import { PrismaService } from '../../../database/prisma.service';
import {
  LedgerPaymentRecord,
  PaymentRepository,
} from '../infrastructure/repositories/payment.repository';
import { SettlementRepository } from '../../settlements/infrastructure/repositories/settlement.repository';
import { AuditService } from '../../audit/application/audit.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { PaymentEntity, PaymentAllocationEntity } from '../domain/entities/payment.entity';
import {
  PaymentMethod,
  PaymentStatus,
  PAYMENT_METHOD_DEFINITIONS,
} from '../domain/constants/payment-methods';
import {
  PaymentNotFoundException,
  TradeNotPayableException,
  TradeNotFoundForPaymentException,
  InvalidPaymentAmountException,
  PaymentOverAllocationException,
  DuplicatePaymentAllocationException,
  InvalidPaymentTransitionException,
  MissingPaymentReferenceException,
  PaymentNotValidatedException,
} from '../domain/exceptions/payment.exceptions';
import { assertReceiptFile } from '../domain/receipt-file';
import {
  PaymentResponseDto,
  PaymentAllocationResponseDto,
  AllocatePaymentResponseDto,
  TradePaymentStatusDto,
  SettlementResponseDto,
  LedgerPaymentDto,
  PaymentSummaryDto,
} from './dto/payment-response.dto';
import { ListPaymentsQueryDto } from './dto/list-payments.query';
import { customerLedgerWhere, foldPaymentSummary, parseLedgerBounds } from './payment-ledger';

export { PaymentEntity, PaymentAllocationEntity };

/**
 * Payment Service
 *
 * =====================================================================
 * PHASE 5 — PAYMENT + PAYMENT ALLOCATION + SETTLEMENT
 * docs/21-business-decisions.md §8, §9
 * architecture/STATE-MACHINES.md (Payment state machine)
 * docs/08-workflows.md §8.5
 * =====================================================================
 *
 * PAYMENT FLOW (§8.5):
 *   1. Accountant records payment → Payment(PENDING)
 *   2. Accountant validates payment → Payment(VALIDATED)
 *   3. Allocate payment to Trade → Payment(ALLOCATED) + PaymentAllocation
 *   4. If 100% paid → Settlement(SETTLED) + Trade(COMPLETED)
 *
 * =====================================================================
 * LEDGER POSTING — BLOCKED
 * =====================================================================
 *
 * The specific DR/CR journal entry rules for payment receipt are NOT
 * documented in docs/21-business-decisions.md §6 or any other doc.
 *
 * The Chart of Accounts (§6.1) defines:
 *   FA-04: Cash (Asset)
 *   FA-05: Bank (Asset)
 *   FA-12: Customer Settlement (Clearing)
 *
 * But the explicit Debit/Credit posting template for:
 *   "When cash payment is received: DR ??? / CR ???"
 *   "When bank transfer is received: DR ??? / CR ???"
 *   ...is NOT documented.
 *
 * Per implementation rule: "DO NOT invent accounting rules. Never silently
 * invent Debit/Credit mappings." (docs/21-business-decisions.md, implementation rule)
 *
 * ⚠️ Payment → Ledger posting is BLOCKED until payment journal entry rules
 * are added to docs/21-business-decisions.md §6.
 *
 * =====================================================================
 * CREDIT / CUSTOMER ACCOUNT INTERACTION — BLOCKED
 * =====================================================================
 *
 * Whether recording a payment should affect CustomerAccount.consumedCreditRial
 * (e.g., restore consumed credit or not) is NOT documented.
 *
 * §3.3 establishes: credit is reserved at Order, consumed at Trade approval.
 * §8.3 states: "payment records are managed manually by the Accountant" but
 * does NOT define the interaction between payment recording and credit.
 *
 * Per §8 of Phase 5 spec: "If behavior is not documented: STOP and report
 * the ambiguity. Do not guess."
 *
 * ⚠️ Credit/Payment interaction is BLOCKED until documented.
 *
 * =====================================================================
 * PAYMENT REVERSAL — BLOCKED
 * =====================================================================
 *
 * §4.2 mentions "Payment reversal (requires Manager approval)" but the
 * reversal rules (ledger entries, state transitions, credit restoration)
 * are NOT documented beyond this single mention.
 *
 * ⚠️ Payment reversal is BLOCKED until documented.
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepo: PaymentRepository,
    private readonly settlementRepo: SettlementRepository,
    private readonly audit: AuditService,
    private readonly notificationService: NotificationService,
    private readonly storage: StorageService,
  ) {}

  // ─── Record Payment ────────────────────────────────────────────────────────

  /**
   * Records a new payment from a customer against a confirmed Trade.
   *
   * Validates:
   * - Trade exists and is in CONFIRMED status
   * - Amount is a positive Decimal
   * - Reference number provided if required by payment method
   * - No duplicate (idempotency key check)
   *
   * Idempotency: if the same idempotencyKey is submitted again, the existing
   * payment is returned without creating a duplicate.
   *
   * @throws TradeNotFoundForPaymentException — Trade does not exist
   * @throws TradeNotPayableException         — Trade is not CONFIRMED
   * @throws InvalidPaymentAmountException    — amount is zero/negative/invalid
   * @throws MissingPaymentReferenceException — reference required but absent
   */
  async recordPayment(
    input: {
      idempotencyKey: string;
      tradeId: string;
      method: PaymentMethod;
      amount: string;
      referenceNumber?: string;
      notes?: string;
      receivedAt?: Date;
    },
    actorUserId: string,
  ): Promise<{ payment: PaymentResponseDto; wasAlreadyRecorded: boolean }> {
    // ── Idempotency check (outside tx for fast path) ───────────────────────
    const existing = await this.paymentRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      this.logger.warn(
        `[PaymentService] Idempotent record: key="${input.idempotencyKey}" already exists`,
      );
      return { payment: PaymentResponseDto.from(existing), wasAlreadyRecorded: true };
    }

    // ── Parse and validate amount ─────────────────────────────────────────
    let amount: Decimal;
    try {
      amount = new Decimal(input.amount);
    } catch {
      throw new InvalidPaymentAmountException(input.amount);
    }
    if (amount.lessThanOrEqualTo(0)) {
      throw new InvalidPaymentAmountException(input.amount);
    }

    // ── Validate reference number ─────────────────────────────────────────
    const methodDef = PAYMENT_METHOD_DEFINITIONS[input.method];
    if (methodDef.requiresReference && !input.referenceNumber) {
      throw new MissingPaymentReferenceException(input.method);
    }

    // ── Validate trade ────────────────────────────────────────────────────
    const trade = await this.prisma.trade.findUnique({ where: { id: input.tradeId } });
    if (!trade) throw new TradeNotFoundForPaymentException(input.tradeId);
    if (trade.status !== 'CONFIRMED') {
      throw new TradeNotPayableException(input.tradeId, trade.status);
    }

    // ── Create payment (in tx for atomicity) ─────────────────────────────
    const payment = await this.prisma.$transaction(async (tx) => {
      // Final idempotency check inside tx (race-safe)
      const raceExisting = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (raceExisting) return this.paymentRepo.mapRaceRow(raceExisting);

      return this.paymentRepo.createPaymentInTx(tx, {
        idempotencyKey: input.idempotencyKey,
        tradeId: input.tradeId,
        customerId: trade.customerId,
        method: input.method,
        amount,
        currency: 'IRR',
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        receivedAt: input.receivedAt ?? null,
        recordedByUserId: actorUserId,
      });
    });

    // ── Audit ─────────────────────────────────────────────────────────────
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: payment.id,
      after: {
        tradeId: payment.tradeId,
        method: payment.method,
        amount: payment.amount.toFixed(2),
        status: payment.status,
        referenceNumber: payment.referenceNumber,
      },
    });

    this.logger.log(
      `[PaymentService] Payment recorded: ${payment.id} ` +
        `(Trade: ${input.tradeId}, amount: ${amount.toFixed(2)} IRR, method: ${input.method})`,
    );

    // Notify customer — docs/16: "payment recorded"
    this.prisma.trade
      .findUnique({
        where: { id: input.tradeId },
        select: { customer: { select: { userId: true, mobile: true } } },
      })
      .then((t) =>
        this.notificationService.dispatch({
          recipientId: t?.customer?.userId ?? null,
          recipientMobile: t?.customer?.mobile ?? null,
          type: NotificationType.PAYMENT_RECORDED,
          subject: 'پرداخت ثبت شد',
          body: `پرداخت به مبلغ ${amount.toFixed(2)} ریال ثبت شد.`,
          relatedEntityType: 'Payment',
          relatedEntityId: payment.id,
        }),
      )
      .catch((err: unknown) =>
        this.logger.error(`[PaymentService] PAYMENT_RECORDED notification failed: ${err}`),
      );

    return { payment: PaymentResponseDto.from(payment), wasAlreadyRecorded: false };
  }

  // ─── Validate Payment ─────────────────────────────────────────────────────

  /**
   * Validates a PENDING payment (accountant confirmation).
   * Transitions: PENDING → VALIDATED
   *
   * @throws PaymentNotFoundException          — payment not found
   * @throws InvalidPaymentTransitionException — not in PENDING status
   */
  async validatePayment(paymentId: string, actorUserId: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new PaymentNotFoundException(paymentId);

    if (!payment.canTransitionTo(PaymentStatus.VALIDATED)) {
      throw new InvalidPaymentTransitionException(
        paymentId,
        payment.status,
        PaymentStatus.VALIDATED,
      );
    }

    const updated = await this.prisma.$transaction((tx) =>
      this.paymentRepo.updateStatusInTx(tx, paymentId, PaymentStatus.VALIDATED, {
        validatedAt: new Date(),
        validatedByUserId: actorUserId,
      }),
    );

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'PAYMENT_VALIDATED',
      entityType: 'Payment',
      entityId: paymentId,
      before: { status: payment.status },
      after: { status: PaymentStatus.VALIDATED, validatedAt: updated.validatedAt?.toISOString() },
    });

    return PaymentResponseDto.from(updated);
  }

  // ─── Allocate Payment ─────────────────────────────────────────────────────

  /**
   * Allocates a VALIDATED payment to a Trade.
   *
   * CONCURRENCY PROTECTION:
   * The allocation transaction acquires a SELECT ... FOR UPDATE lock on the
   * Trade row before computing the total allocated amount. This prevents two
   * concurrent allocation requests from both succeeding when only one should.
   * §13: "system must NOT allow total allocation to exceed Trade total."
   *
   * SETTLEMENT:
   * After allocation, recomputes the total allocated for the Trade.
   * If total >= Trade total, Settlement is SETTLED and Trade status → COMPLETED.
   *
   * LEDGER POSTING: BLOCKED — see class-level comment above.
   *
   * @throws PaymentNotFoundException         — payment not found
   * @throws PaymentNotValidatedException     — payment not in VALIDATED status
   * @throws PaymentOverAllocationException   — would exceed Trade remaining balance
   * @throws DuplicatePaymentAllocationException — already allocated to this trade
   */
  async allocatePayment(
    paymentId: string,
    input: { tradeId: string; amount: string },
    actorUserId: string,
  ): Promise<AllocatePaymentResponseDto> {
    // ── Load payment ──────────────────────────────────────────────────────
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) throw new PaymentNotFoundException(paymentId);

    if (payment.status !== PaymentStatus.VALIDATED) {
      throw new PaymentNotValidatedException(paymentId, payment.status);
    }

    // ── Parse amount ──────────────────────────────────────────────────────
    let allocationAmount: Decimal;
    try {
      allocationAmount = new Decimal(input.amount);
    } catch {
      throw new InvalidPaymentAmountException(input.amount);
    }
    if (allocationAmount.lessThanOrEqualTo(0)) {
      throw new InvalidPaymentAmountException(input.amount);
    }

    // ── Check for existing allocation ─────────────────────────────────────
    const existingAlloc = await this.paymentRepo.findAllocationByPaymentAndTrade(
      paymentId,
      input.tradeId,
    );
    if (existingAlloc) {
      throw new DuplicatePaymentAllocationException(paymentId, input.tradeId);
    }

    // ── Load trade ────────────────────────────────────────────────────────
    const trade = await this.prisma.trade.findUnique({ where: { id: input.tradeId } });
    if (!trade) throw new TradeNotFoundForPaymentException(input.tradeId);

    const tradeTotal = new Decimal(trade.totalAmountRial.toString());

    // ── Atomic: lock trade → check remaining → create allocation → update settlement ──
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock trade row for this transaction (concurrency protection)
      await tx.$executeRaw`SELECT id FROM trades WHERE id = ${input.tradeId} FOR UPDATE`;

      // Compute current total allocated INSIDE transaction (after lock)
      const currentTotal = await this.paymentRepo.getTotalAllocatedForTradeInTx(tx, input.tradeId);
      const remaining = tradeTotal.minus(currentTotal);

      // Reject over-allocation
      if (allocationAmount.greaterThan(remaining)) {
        throw new PaymentOverAllocationException(
          allocationAmount.toFixed(2),
          remaining.toFixed(2),
          input.tradeId,
        );
      }

      // Create allocation record
      const allocation = await this.paymentRepo.createAllocationInTx(tx, {
        paymentId,
        tradeId: input.tradeId,
        amount: allocationAmount,
        allocatedByUserId: actorUserId,
      });

      // New total after this allocation
      const newTotal = currentTotal.plus(allocationAmount);

      // Update payment status → ALLOCATED
      const updatedPayment = await this.paymentRepo.updateStatusInTx(
        tx,
        paymentId,
        PaymentStatus.ALLOCATED,
      );

      // Update settlement (upsert — creates if not exists)
      const settlement = await this.settlementRepo.upsertSettlementInTx(tx, {
        tradeId: input.tradeId,
        settledAmount: newTotal,
        tradeTotal,
        actorUserId,
      });

      // If fully settled: update Trade status → COMPLETED + Order status → COMPLETED
      if (settlement.isSettled()) {
        // Trade: CONFIRMED → SETTLING → COMPLETED
        // (We update directly to COMPLETED since full payment = immediate completion)
        await tx.trade.update({
          where: { id: input.tradeId },
          data: { status: 'COMPLETED' },
        });

        // Update related Order to COMPLETED as well
        await tx.order.update({
          where: { id: trade.orderId },
          data: { status: 'COMPLETED' },
        });

        // Update payment status → COMPLETED
        const completedPayment = await this.paymentRepo.updateStatusInTx(
          tx,
          paymentId,
          PaymentStatus.COMPLETED,
        );

        return { payment: completedPayment, allocation, settlement };
      }

      return { payment: updatedPayment, allocation, settlement };
    });

    // ── Audit ─────────────────────────────────────────────────────────────
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: result.settlement.isSettled() ? 'PAYMENT_ALLOCATED_SETTLED' : 'PAYMENT_ALLOCATED',
      entityType: 'Payment',
      entityId: paymentId,
      after: {
        allocationId: result.allocation.id,
        tradeId: input.tradeId,
        allocatedAmount: allocationAmount.toFixed(2),
        newTotalAllocated: result.settlement.settledAmount.toFixed(2),
        settlementStatus: result.settlement.status,
        tradeCompleted: result.settlement.isSettled(),
      },
    });

    this.logger.log(
      `[PaymentService] Payment ${paymentId} allocated to Trade ${input.tradeId}: ` +
        `${allocationAmount.toFixed(2)} IRR | settlement=${result.settlement.status}`,
    );

    // Notify customer on settlement — docs/16: "settlement completed"
    if (result.settlement.isSettled()) {
      this.prisma.trade
        .findUnique({
          where: { id: input.tradeId },
          select: { tradeNumber: true, customer: { select: { userId: true, mobile: true } } },
        })
        .then((t) =>
          this.notificationService.dispatch({
            recipientId: t?.customer?.userId ?? null,
            recipientMobile: t?.customer?.mobile ?? null,
            type: NotificationType.SETTLEMENT_COMPLETED,
            subject: 'تسویه کامل شد',
            body: `معامله شماره ${t?.tradeNumber ?? input.tradeId} به طور کامل تسویه شد.`,
            relatedEntityType: 'Settlement',
            relatedEntityId: result.settlement.id,
          }),
        )
        .catch((err: unknown) =>
          this.logger.error(`[PaymentService] SETTLEMENT_COMPLETED notification failed: ${err}`),
        );
    }

    const response = new AllocatePaymentResponseDto();
    response.payment = PaymentResponseDto.from(result.payment);
    response.allocation = PaymentAllocationResponseDto.from(result.allocation);
    response.settlement = SettlementResponseDto.from(result.settlement);
    response.wasAlreadyAllocated = false;
    return response;
  }

  // ─── Read Operations ──────────────────────────────────────────────────────

  async getPaymentById(id: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepo.findById(id);
    if (!payment) throw new PaymentNotFoundException(id);
    return PaymentResponseDto.from(payment);
  }

  /**
   * Staff listing. customerId in the query is trusted only because the
   * controller requires payment.read. Includes every status, including PENDING.
   */
  async listPayments(opts: {
    limit?: number;
    offset?: number;
    tradeId?: string;
    customerId?: string;
    status?: PaymentStatus;
  }): Promise<{ data: PaymentResponseDto[]; meta: PaginationMeta }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const where = {
      ...(opts.tradeId ? { tradeId: opts.tradeId } : {}),
      ...(opts.customerId ? { customerId: opts.customerId } : {}),
      ...(opts.status ? { status: opts.status } : {}),
    };
    const [payments, total] = await Promise.all([
      this.paymentRepo.findAll({ ...opts, limit, offset }),
      this.paymentRepo.count(where),
    ]);
    return {
      data: payments.map(PaymentResponseDto.from),
      meta: {
        page: Math.floor(offset / limit) + 1,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  /**
   * Customer ledger. The customer id is resolved from the session user.
   * Query customerId is ignored. PENDING receipts are excluded.
   */
  async listOwnPayments(
    actorUserId: string,
    query: ListPaymentsQueryDto,
  ): Promise<{ data: LedgerPaymentDto[]; meta: PaginationMeta }> {
    const limit = query.limit && [10, 20, 50].includes(query.limit) ? query.limit : 10;
    const page = query.page ?? 1;
    const customerId = await this.resolveCustomerId(actorUserId);
    if (!customerId) {
      return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
    }

    const bounds = parseLedgerBounds(query);
    const where = customerLedgerWhere(customerId, bounds);
    const { total, rows } = await this.paymentRepo.queryLedger(where, page, limit);
    return {
      data: rows.map((row) => this.toLedgerDto(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  /**
   * Summary for the same date, type, and search window as the ledger.
   * Status chips filter the list only, so the four cards stay an overview.
   */
  async summarizeOwn(actorUserId: string, query: ListPaymentsQueryDto): Promise<PaymentSummaryDto> {
    const customerId = await this.resolveCustomerId(actorUserId);
    if (!customerId) {
      return foldPaymentSummary([], false);
    }
    const bounds = parseLedgerBounds(query);
    const [groups, anyCount] = await Promise.all([
      this.paymentRepo.summarizeLedger(
        customerLedgerWhere(customerId, bounds, { ignoreStatusGroup: true }),
      ),
      this.paymentRepo.count({ customerId, status: { not: 'PENDING' } }),
    ]);
    return foldPaymentSummary(groups, anyCount > 0);
  }

  /**
   * Detail for the authenticated actor.
   * Customers who do not own the payment get 404, including when the id exists
   * for someone else, and including PENDING rows which are not on this ledger.
   */
  async getPaymentForActor(
    actorUserId: string,
    paymentId: string,
    isStaff: boolean,
  ): Promise<LedgerPaymentDto> {
    if (isStaff) {
      const payment = await this.paymentRepo.findById(paymentId);
      if (!payment) throw new PaymentNotFoundException(paymentId);
      return this.toLedgerDto({
        payment,
        orderId: null,
        orderNumber: null,
        tradeNumber: null,
        relatedSide: null,
      });
    }

    const customerId = await this.resolveCustomerId(actorUserId);
    if (!customerId) throw new PaymentNotFoundException(paymentId);
    const owned = await this.paymentRepo.findOwned(paymentId, customerId);
    if (!owned) throw new PaymentNotFoundException(paymentId);
    return this.toLedgerDto(owned);
  }

  async getTradePaymentStatusForActor(
    actorUserId: string,
    tradeId: string,
    isStaff: boolean,
  ): Promise<TradePaymentStatusDto> {
    if (!isStaff) {
      const customerId = await this.resolveCustomerId(actorUserId);
      const trade = await this.prisma.trade.findUnique({
        where: { id: tradeId },
        select: { customerId: true },
      });
      if (!trade || !customerId || trade.customerId !== customerId) {
        throw new TradeNotFoundForPaymentException(tradeId);
      }
    }
    return this.getTradePaymentStatus(tradeId);
  }

  /**
   * Customer submits the receipt for a confirmed trade they own.
   * The payment stays PENDING until an accountant validates it.
   * customerId is taken from the session, never from the request.
   */
  async submitOwnReceipt(
    actorUserId: string,
    input: {
      tradeId: string;
      method: PaymentMethod;
      amount: string;
      referenceNumber?: string;
      file: { buffer: Buffer; mimetype: string; size: number; originalname: string };
    },
  ): Promise<LedgerPaymentDto> {
    const mime = assertReceiptFile(input.file);
    const customerId = await this.resolveCustomerId(actorUserId);
    if (!customerId) throw new TradeNotFoundForPaymentException(input.tradeId);

    let amount: Decimal;
    try {
      amount = new Decimal(input.amount);
    } catch {
      throw new InvalidPaymentAmountException(input.amount);
    }
    if (amount.lessThanOrEqualTo(0)) throw new InvalidPaymentAmountException(input.amount);

    const methodDef = PAYMENT_METHOD_DEFINITIONS[input.method];
    if (!methodDef) throw new InvalidPaymentAmountException(input.amount);
    const reference = input.referenceNumber?.trim() || undefined;
    if (methodDef.requiresReference && !reference) {
      throw new MissingPaymentReferenceException(input.method);
    }

    const trade = await this.prisma.trade.findUnique({ where: { id: input.tradeId } });
    if (!trade || trade.customerId !== customerId) {
      throw new TradeNotFoundForPaymentException(input.tradeId);
    }
    if (trade.status !== 'CONFIRMED') {
      throw new TradeNotPayableException(input.tradeId, trade.status);
    }

    const stored = await this.storage.upload({
      buffer: input.file.buffer,
      originalName: input.file.originalname,
      mimeType: mime,
      sizeBytes: input.file.size,
      prefix: `payment-receipts/${customerId}`,
    });

    try {
      const payment = await this.prisma.$transaction((tx) =>
        this.paymentRepo.createPaymentInTx(tx, {
          idempotencyKey: randomUUID(),
          tradeId: trade.id,
          customerId,
          method: input.method,
          amount,
          currency: 'IRR',
          referenceNumber: reference ?? null,
          notes: 'رسید توسط مشتری بارگذاری شد',
          receivedAt: new Date(),
          recordedByUserId: actorUserId,
          receiptKey: stored.key,
          receiptMimeType: mime,
          receiptFileName: input.file.originalname.slice(0, 180),
        }),
      );

      await this.audit.log({
        actorId: actorUserId,
        actorType: 'USER',
        action: 'PAYMENT_RECEIPT_UPLOADED',
        entityType: 'Payment',
        entityId: payment.id,
        after: {
          tradeId: payment.tradeId,
          method: payment.method,
          amount: payment.amount.toFixed(2),
          hasReceipt: true,
        },
      });

      return this.toLedgerDto({
        payment,
        orderId: null,
        orderNumber: null,
        tradeNumber: trade.tradeNumber,
        relatedSide: null,
      });
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async listOwnPayableTrades(
    actorUserId: string,
  ): Promise<
    Array<{ id: string; tradeNumber: string; orderNumber: string | null; totalAmountRial: string }>
  > {
    const customerId = await this.resolveCustomerId(actorUserId);
    if (!customerId) return [];
    const trades = await this.prisma.trade.findMany({
      where: { customerId, status: 'CONFIRMED' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        tradeNumber: true,
        totalAmountRial: true,
        order: { select: { orderNumber: true } },
      },
    });
    return trades.map((trade) => ({
      id: trade.id,
      tradeNumber: trade.tradeNumber,
      orderNumber: trade.order?.orderNumber ?? null,
      totalAmountRial: trade.totalAmountRial.toString(),
    }));
  }

  async readReceiptForActor(
    actorUserId: string,
    paymentId: string,
    isStaff: boolean,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const payment = isStaff
      ? await this.paymentRepo.findById(paymentId)
      : await this.resolveCustomerId(actorUserId).then(async (customerId) =>
          customerId
            ? ((await this.paymentRepo.findOwned(paymentId, customerId))?.payment ?? null)
            : null,
        );
    if (!payment?.receiptKey) throw new PaymentNotFoundException(paymentId);
    const buffer = await this.storage.getObject(payment.receiptKey);
    return {
      buffer,
      mimeType: payment.receiptMimeType || 'application/octet-stream',
      fileName: payment.receiptFileName || 'receipt',
    };
  }

  async getTradePaymentStatus(tradeId: string): Promise<TradePaymentStatusDto> {
    const trade = await this.prisma.trade.findUnique({ where: { id: tradeId } });
    if (!trade) throw new TradeNotFoundForPaymentException(tradeId);

    const [payments, allocations, settlement] = await Promise.all([
      this.paymentRepo.findByTradeId(tradeId),
      this.paymentRepo.findAllocationsByTradeId(tradeId),
      this.settlementRepo.findByTradeId(tradeId),
    ]);

    const tradeTotal = new Decimal(trade.totalAmountRial.toString());
    const totalAllocated = allocations.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));

    return TradePaymentStatusDto.build({
      tradeId,
      tradeTotal,
      totalAllocated,
      settlementStatus: settlement?.status ?? 'PENDING',
      payments,
      allocations,
    });
  }

  private async resolveCustomerId(actorUserId: string): Promise<string | null> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: actorUserId },
      select: { id: true },
    });
    return customer?.id ?? null;
  }

  private toLedgerDto(record: LedgerPaymentRecord): LedgerPaymentDto {
    const dto = Object.assign(new LedgerPaymentDto(), PaymentResponseDto.from(record.payment));
    dto.orderId = record.orderId;
    dto.orderNumber = record.orderNumber;
    dto.tradeNumber = record.tradeNumber;
    dto.relatedSide = record.relatedSide;
    return dto;
  }
}
