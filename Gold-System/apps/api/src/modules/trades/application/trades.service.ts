import { Injectable, Logger } from '@nestjs/common';
import { TradeStatus, QuotationStatus } from '@gold/shared-types';
import Decimal from 'decimal.js';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { OrderRepository } from '../../orders/infrastructure/repositories/order.repository';
import { QuotationRepository } from '../../quotations/infrastructure/repositories/quotation.repository';
import { CustomerAccountRepository } from '../../customer-accounts/infrastructure/repositories/customer-account.repository';
import { TradeRepository } from '../infrastructure/repositories/trade.repository';
import { TradeLedgerPostingService } from '../../financial-ledger/application/trade-ledger-posting.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { TradingPolicyService } from '../../trading-policy/application/trading-policy.service';

import { ConfirmTradeDto } from './dto/confirm-trade.dto';
import { ReverseTradeDto } from './dto/reverse-trade.dto';
import { ListTradesDto } from './dto/list-trades.dto';
import { TradeResponseDto, TradeListResponseDto } from './dto/trade-response.dto';

import {
  TradeNotFoundException,
  DuplicateTradeException,
  OrderNotEligibleForTradeException,
  InvalidTradeStateTransitionException,
  NoActiveQuotationForTradeException,
} from '../domain/exceptions/trade.exceptions';
import { OrderNotFoundException } from '../../orders/domain/exceptions/order.exceptions';

@Injectable()
export class TradesService {
  private readonly logger = new Logger(TradesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tradeRepo: TradeRepository,
    private readonly orderRepo: OrderRepository,
    private readonly quotationRepo: QuotationRepository,
    private readonly accountRepo: CustomerAccountRepository,
    private readonly audit: AuditService,
    private readonly tradeLedger: TradeLedgerPostingService,
    private readonly notificationService: NotificationService,
    private readonly tradingPolicy: TradingPolicyService,
  ) {}

  // ─── Confirm Trade ──────────────────────────────────────────────────────────

  /**
   * Confirms a Trade from an APPROVED Order.
   *
   * PROCESS (UC-11 — Confirm Trade):
   *   1. Validate Order exists and is APPROVED
   *   2. Check no duplicate Trade (unique constraint on orderId)
   *   3. Identify the ACTIVE Quotation to lock terms from
   *   4. Inside a SINGLE atomic transaction:
   *      a. Re-read Order status (SELECT FOR UPDATE-equivalent via fresh read)
   *      b. Generate TRD-XXXXXX trade number
   *      c. Create Trade (CONFIRMED) + TradeItems from Quotation snapshot
   *      d. Consume credit: reserved → consumed (§3.3, SELECT FOR UPDATE)
   *      e. Transition Order: APPROVED → TRADE_CREATED
   *      f. Transition Quotation: ACTIVE → CONVERTED
   *   5. Audit: TRADE_CREATED, ORDER_STATUS_CHANGED, QUOTATION_CONVERTED
   *
   * CONCURRENCY: Two simultaneous confirmations for the same Order will serialize
   * on the Prisma SELECT FOR UPDATE inside consumeCredit(). The second caller will
   * fail the orderId unique constraint (or the canCreateTrade() guard re-read).
   *
   * IMMUTABILITY (BR-T02): All financial fields are set from the locked Quotation
   * snapshot and never updated. Phase 4 accounting uses Trade.id as source reference.
   *
   * ACCOUNTING INTEGRATION BOUNDARY (Phase 4):
   *   Trade.id → FinancialLedgerEntry (source_type='TRADE', source_id=trade.id)
   *   Phase 4 settlement creates GoldLedgerEntry + FinancialLedgerEntry referencing this Trade.
   *
   * @param actorUserId  Staff user confirming the Trade (requires trade.approve permission)
   * @param dto          ConfirmTradeDto containing the orderId
   */
  async confirmTrade(actorUserId: string, dto: ConfirmTradeDto): Promise<TradeResponseDto> {
    const { orderId, notes } = dto;

    // 1. Validate Order
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new OrderNotFoundException(orderId);
    }

    if (!order.canCreateTrade()) {
      throw new OrderNotEligibleForTradeException(orderId, order.status);
    }

    // 2. Check no duplicate Trade
    const existingTrade = await this.tradeRepo.findByOrderId(orderId);
    if (existingTrade) {
      throw new DuplicateTradeException(orderId);
    }

    // 3. Find active Quotation to lock terms from
    const quotations = await this.quotationRepo.findByOrderId(orderId);
    const activeQuotation = quotations.find((q) => q.status === QuotationStatus.ACTIVE);
    if (!activeQuotation) {
      throw new NoActiveQuotationForTradeException(orderId);
    }

    const confirmedAt = new Date();

    // 4. Atomic transaction: Create Trade + consume credit + transition states
    const trade = await this.prisma.$transaction(async (tx) => {
      // Concurrency guard: re-read Order status inside transaction
      // If another request already confirmed this Order between step 1 and now,
      // its status will no longer be APPROVED.
      const freshOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (freshOrder?.status !== 'APPROVED') {
        throw new OrderNotEligibleForTradeException(orderId, freshOrder?.status ?? 'UNKNOWN');
      }

      await this.tradingPolicy.validateTransaction({
        at: confirmedAt,
        amountRial: activeQuotation.totalAmountRial,
        weightGrams: activeQuotation.weightGrams,
        customerId: order.customerId,
        transactionType: 'TRADE',
        tx,
      });

      // Generate sequential trade number (count + 1 within tx)
      const tradeNumber = await this.tradeRepo.nextTradeNumber(tx);

      // Build the locked terms snapshot for Phase 4 reference
      const lockedTermsSnapshot: Record<string, unknown> = {
        version: '1.0',
        lockedAt: confirmedAt.toISOString(),
        orderId,
        orderNumber: order.orderNumber,
        quotationId: activeQuotation.id,
        quotationNumber: activeQuotation.quotationNumber,
        pricingCalculationId: activeQuotation.pricingCalculationId,
        pricing: {
          step1BasePrice: activeQuotation.step1BasePrice?.toString() ?? null,
          wageAmount: activeQuotation.wageAmount?.toString() ?? null,
          discountAmount: activeQuotation.discountAmount?.toString() ?? null,
          roundingAmount: activeQuotation.roundingAmount?.toString() ?? null,
          // profitAmount and taxAmount are BLOCKED (§13.2, §13.3) — stored as null
          profitAmount: null,
          taxAmount: null,
          isComplete: activeQuotation.isComplete,
        },
        confirmedByUserId: actorUserId,
        notes: notes ?? null,
        // ACCOUNTING INTEGRATION BOUNDARY (Phase 4):
        // This snapshot serves as the immutable source for:
        //   FinancialLedgerEntry (source_type='TRADE', source_id=<trade.id>)
        //   GoldLedgerEntry
        //   Settlement records
        accountingBoundary: 'PHASE_4_DEFERRED',
      };

      // Create Trade (CONFIRMED) + TradeItems from Quotation snapshot
      const created = await this.tradeRepo.createInTx(tx, {
        tradeNumber,
        orderId,
        quotationId: activeQuotation.id,
        customerId: order.customerId,
        pricingCalculationId: activeQuotation.pricingCalculationId,
        status: TradeStatus.CONFIRMED,
        totalAmountRial: activeQuotation.totalAmountRial,
        weightGrams: activeQuotation.weightGrams,
        purityRatio: activeQuotation.purityRatio,
        // unitPriceRial: from the first QuotationItem (MVP: single-item orders)
        unitPriceRial: activeQuotation.items[0]?.unitPriceRial ?? new Decimal(0),
        step1BasePrice: activeQuotation.step1BasePrice,
        wageAmount: activeQuotation.wageAmount,
        profitAmount: null, // null = BLOCKED §13.2 (profit base undefined in this phase)
        taxAmount: null, // null = BLOCKED §13.3 (tax rules undefined in this phase)
        discountAmount: activeQuotation.discountAmount,
        roundingAmount: activeQuotation.roundingAmount,
        isComplete: activeQuotation.isComplete,
        customerType: order.customerType?.toString() ?? null,
        lockedTermsSnapshot,
        confirmedByUserId: actorUserId,
        confirmedAt,
        items: activeQuotation.items.map((item) => ({
          weightGrams: item.weightGrams,
          purityRatio: item.purityRatio,
          unitPriceRial: item.unitPriceRial,
          totalPriceRial: item.totalPriceRial,
          description: item.description,
        })),
      });

      // §3.3: Move credit from reserved → consumed atomically
      // Uses SELECT FOR UPDATE inside consumeCredit() to serialize concurrent attempts
      await this.accountRepo.consumeCredit({
        tx,
        customerId: order.customerId,
        amount: order.reservedAmountRial,
        tradeId: created.id,
        orderId,
        actorId: actorUserId,
      });

      // Transition Order: APPROVED → TRADE_CREATED
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'TRADE_CREATED', updatedAt: new Date() },
      });

      // Transition Quotation: ACTIVE → CONVERTED
      await tx.quotation.updateMany({
        where: { orderId, status: 'ACTIVE' },
        data: { status: 'CONVERTED', updatedAt: new Date() },
      });

      // ─── Phase 4: Ledger Postings ─────────────────────────────────────────
      // Post financial and gold ledger entries atomically within this transaction.
      // Idempotency keys prevent duplicate posting if this transaction is retried.
      //
      // DOCUMENTED POSTINGS (docs/21-business-decisions.md §6.1, §6.2):
      //   Financial: DR FA-02 / CR FA-06 for totalAmountRial
      //   Gold:      GA-02 IN for weightGrams/purityRatio
      //
      // BLOCKED (not posted — see TradeLedgerPostingService for details):
      //   FA-07 (profit) — §13.2; FA-09 (tax) — §13.3; GA-01 — open-questions.md #39
      await this.tradeLedger.postTradeConfirmInTx(
        tx,
        {
          id: created.id,
          tradeNumber: created.tradeNumber,
          totalAmountRial: created.totalAmountRial,
          weightGrams: created.weightGrams,
          purityRatio: created.purityRatio,
          discountAmount: created.discountAmount,
          customerId: created.customerId,
        },
        actorUserId,
      );

      return created;
    });

    // 5. Audit trail (write-once; outside transaction for safety)
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'TRADE_CREATED',
      entityType: 'Trade',
      entityId: trade.id,
      before: null,
      after: {
        tradeNumber: trade.tradeNumber,
        orderId,
        quotationId: activeQuotation.id,
        status: TradeStatus.CONFIRMED,
        totalAmountRial: trade.totalAmountRial.toFixed(2),
        ledgerPosting: {
          financialIdempotencyKey: TradeLedgerPostingService.financialKeyForConfirm(trade.id),
          goldIdempotencyKey: TradeLedgerPostingService.goldKeyForConfirm(trade.id),
          fa02Debit: trade.totalAmountRial.toFixed(2),
          fa06Credit: trade.totalAmountRial.toFixed(2),
          ga02QuantityIn: trade.weightGrams.toFixed(6),
        },
      },
      reason: notes ?? 'Trade confirmed from approved order',
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_STATUS_CHANGED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: 'APPROVED' },
      after: { status: 'TRADE_CREATED', tradeId: trade.id },
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'QUOTATION_CONVERTED',
      entityType: 'Quotation',
      entityId: activeQuotation.id,
      before: { status: QuotationStatus.ACTIVE },
      after: { status: QuotationStatus.CONVERTED, tradeId: trade.id },
    });

    this.logger.log(
      `Trade ${trade.tradeNumber} confirmed by ${actorUserId} ` + `for order ${order.orderNumber}`,
    );

    // Notify customer — docs/16: "trade approved"
    // Non-blocking: notification failure must not invalidate the trade
    this.prisma.customer
      .findUnique({ where: { id: order.customerId }, select: { userId: true, mobile: true } })
      .then((customer) =>
        this.notificationService.dispatch({
          recipientId: customer?.userId ?? null,
          recipientMobile: customer?.mobile ?? null,
          type: NotificationType.TRADE_CONFIRMED,
          subject: 'معامله تأیید شد',
          body: `معامله شماره ${trade.tradeNumber} به مبلغ ${trade.totalAmountRial.toFixed(2)} ریال تأیید شد.`,
          relatedEntityType: 'Trade',
          relatedEntityId: trade.id,
        }),
      )
      .catch((err: unknown) =>
        this.logger.error(`[TradesService] TRADE_CONFIRMED notification failed: ${err}`),
      );

    return TradeResponseDto.fromEntity(trade);
  }

  // ─── Reverse Trade ──────────────────────────────────────────────────────────

  /**
   * Reverses a CONFIRMED Trade under exceptional circumstances.
   *
   * §4.2: Trade reversal rules:
   *   - Only CONFIRMED trades can be reversed
   *   - Requires Manager authorization (enforced via permission: trade.approve)
   *   - A documented reason is mandatory
   *   - Credit: consumedCreditRial -= trade.totalAmountRial (back to available)
   *
   * ACCOUNTING INTEGRATION BOUNDARY (Phase 4 — DEFERRED):
   *   Financial/Gold Ledger reversal entries are NOT created here.
   *   Phase 4 settlement will handle GL reversals referencing Trade.id.
   *
   * Order and Quotation statuses are NOT reverted — Trade.status = REVERSED
   * is the canonical state. Phase 4 may handle subsequent re-processing.
   *
   * @param actorUserId  Staff user reversing the Trade (requires trade.approve)
   * @param tradeId      ID of the Trade to reverse
   * @param dto          ReverseTradeDto with documented reason
   */
  async reverseTrade(
    actorUserId: string,
    tradeId: string,
    dto: ReverseTradeDto,
  ): Promise<TradeResponseDto> {
    // 1. Load Trade
    const trade = await this.tradeRepo.findById(tradeId);
    if (!trade) {
      throw new TradeNotFoundException(tradeId);
    }

    if (!trade.canReverse()) {
      throw new InvalidTradeStateTransitionException(trade.status, 'reverse');
    }

    const reversedAt = new Date();

    // 2. Atomic transaction: update Trade + reverse credit
    await this.prisma.$transaction(async (tx) => {
      // Concurrency guard: re-read Trade status inside transaction
      const freshTrade = await tx.trade.findUnique({
        where: { id: tradeId },
        select: { status: true },
      });
      if (freshTrade?.status !== 'CONFIRMED') {
        throw new InvalidTradeStateTransitionException(freshTrade?.status ?? 'UNKNOWN', 'reverse');
      }

      // Transition Trade: CONFIRMED → REVERSED
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: 'REVERSED',
          reversedByUserId: actorUserId,
          reversedAt,
          reversalReason: dto.reason,
          updatedAt: new Date(),
        },
      });

      // §4.2: Reverse credit consumption — consumedCredit back to available
      // Financial/Gold Ledger reversal deferred to Phase 4
      await this.accountRepo.reverseConsumption({
        tx,
        customerId: trade.customerId,
        amount: trade.totalAmountRial,
        tradeId,
        actorId: actorUserId,
        reason: dto.reason,
      });

      // ─── Phase 4: Ledger Reversal Postings ─────────────────────────────────
      // Post reversal entries atomically within this transaction.
      // Documented per docs/21-business-decisions.md §4.2:
      //   Financial: DR FA-06 / CR FA-02 for totalAmountRial
      //   Gold:      GA-02 OUT for weightGrams/purityRatio
      await this.tradeLedger.postTradeReversalInTx(
        tx,
        {
          id: trade.id,
          tradeNumber: trade.tradeNumber,
          totalAmountRial: trade.totalAmountRial,
          weightGrams: trade.weightGrams,
          purityRatio: trade.purityRatio,
        },
        actorUserId,
        dto.reason,
      );
    });

    // 3. Reload Trade after update
    const reversed = await this.tradeRepo.findById(tradeId);

    // 4. Audit trail
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'TRADE_REVERSED',
      entityType: 'Trade',
      entityId: tradeId,
      before: { status: 'CONFIRMED' },
      after: {
        status: 'REVERSED',
        reversedByUserId: actorUserId,
        reversedAt: reversedAt.toISOString(),
        reason: dto.reason,
      },
      reason: dto.reason,
    });

    this.logger.warn(
      `Trade ${trade.tradeNumber} REVERSED by ${actorUserId}. Reason: ${dto.reason}`,
    );

    // Notify customer — docs/16: "trade rejected"
    this.prisma.customer
      .findUnique({ where: { id: trade.customerId }, select: { userId: true, mobile: true } })
      .then((customer) =>
        this.notificationService.dispatch({
          recipientId: customer?.userId ?? null,
          recipientMobile: customer?.mobile ?? null,
          type: NotificationType.TRADE_REVERSED,
          subject: 'معامله لغو شد',
          body: `معامله شماره ${trade.tradeNumber} لغو گردید.${dto.reason ? ` دلیل: ${dto.reason}` : ''}`,
          relatedEntityType: 'Trade',
          relatedEntityId: trade.id,
        }),
      )
      .catch((err: unknown) =>
        this.logger.error(`[TradesService] TRADE_REVERSED notification failed: ${err}`),
      );

    return TradeResponseDto.fromEntity(reversed!);
  }

  // ─── Get Trade ──────────────────────────────────────────────────────────────

  /**
   * Gets a single Trade by ID.
   *
   * Customer isolation: customers can only see their own Trades.
   * Returns 404 (not 403) for unauthorized access — prevents enumeration.
   *
   * @param actorUserId   The requesting user's ID
   * @param tradeId       The Trade ID
   * @param isStaff       True for staff; false for customers
   */
  async getTrade(
    actorUserId: string,
    tradeId: string,
    isStaff: boolean,
  ): Promise<TradeResponseDto> {
    let trade;
    if (isStaff) {
      trade = await this.tradeRepo.findById(tradeId);
    } else {
      // Customer: resolve their customerId then enforce isolation at query level
      const customerId = await this.resolveCustomerId(actorUserId);
      trade = await this.tradeRepo.findByIdForCustomer(tradeId, customerId);
    }

    if (!trade) {
      throw new TradeNotFoundException(tradeId);
    }

    return TradeResponseDto.fromEntity(trade);
  }

  // ─── List Trades ─────────────────────────────────────────────────────────

  /**
   * Lists Trades with pagination.
   *
   * Staff: all Trades (with optional status filter).
   * Customer: only own Trades (enforced by customerId scope).
   *
   * @param actorUserId   The requesting user's ID
   * @param dto           Pagination + filter options
   * @param isStaff       True for staff; false for customers
   */
  async listTrades(
    actorUserId: string,
    dto: ListTradesDto,
    isStaff: boolean,
  ): Promise<TradeListResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    let result: { trades: import('../domain/entities/trade.entity').TradeEntity[]; total: number };

    if (isStaff) {
      result = await this.tradeRepo.findAll({
        page,
        limit,
        status: dto.status,
      });
    } else {
      const customerId = await this.resolveCustomerId(actorUserId);
      result = await this.tradeRepo.findByCustomerId(customerId, {
        page,
        limit,
      });
    }

    const response = new TradeListResponseDto();
    response.trades = result.trades.map((t) => TradeResponseDto.fromEntity(t));
    response.total = result.total;
    response.page = page;
    response.limit = limit;
    return response;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Resolve the Customer record ID for a given user.
   * Throws TradeNotFoundException (404) if the user has no Customer profile
   * to prevent revealing details about other customers.
   */
  private async resolveCustomerId(userId: string): Promise<string> {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new TradeNotFoundException(userId); // 404 — prevents enumeration
    }
    return customer.id;
  }
}
