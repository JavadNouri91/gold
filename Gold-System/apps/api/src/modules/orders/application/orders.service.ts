import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import Decimal from 'decimal.js';
import { CustomerType, CustomerStatus, OrderStatus } from '@gold/shared-types';

import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { PricingEngineService } from '../../pricing/application/pricing-engine.service';
import { OrderRepository } from '../infrastructure/repositories/order.repository';
import { CustomerAccountRepository } from '../../customer-accounts/infrastructure/repositories/customer-account.repository';
import { QuotationsService } from '../../quotations/application/quotations.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { TradingPolicyService } from '../../trading-policy/application/trading-policy.service';

import { CreateOrderDto } from './dto/create-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { RejectOrderDto } from './dto/reject-order.dto';
import { ApproveOrderDto } from './dto/approve-order.dto';
import { RequestRevisionDto } from './dto/request-revision.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { OrderEntity } from '../domain/entities/order.entity';
import { OrderItemEntity } from '../domain/entities/order-item.entity';
import { PaginationMeta } from '@gold/shared-types';

import {
  InvalidOrderStateTransitionException,
  CustomerCancellationDisabledException,
  OrderAccessDeniedException,
  OrderNotFoundException,
  CustomerNotEligibleForOrderException,
} from '../domain/exceptions/order.exceptions';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderRepo: OrderRepository,
    private readonly accountRepo: CustomerAccountRepository,
    private readonly pricingEngine: PricingEngineService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => QuotationsService))
    private readonly quotationsService: QuotationsService,
    private readonly notificationService: NotificationService,
    private readonly tradingPolicy: TradingPolicyService,
  ) {}

  // ─── Create Order (DRAFT) ─────────────────────────────────────

  /**
   * Creates a DRAFT order for an authenticated customer.
   *
   * Process:
   *   1. Verify the caller is a customer (has a Customer profile)
   *   2. Verify customer KYC is APPROVED and account is ACTIVE
   *   3. Call PricingEngine to compute the order total and create a PricingCalculation
   *   4. Create Order (status=DRAFT) + OrderItem atomically
   *
   * No credit is reserved at this stage — credit reservation happens on submit (§3.3).
   *
   * docs/21-business-decisions.md §3.3
   */
  async createOrder(actorUserId: string, dto: CreateOrderDto): Promise<OrderResponseDto> {
    await this.tradingPolicy.assertTradingOpen();

    // ── 1. Resolve Customer from userId ──────────────────────────
    const { customer, account } = await this.resolveCustomerAndAccount(actorUserId);

    // ── 2. Validate weightGrams and purityRatio ───────────────────
    const weightGrams = new Decimal(dto.weightGrams);
    const purityRatio = new Decimal(dto.purityRatio);

    if (weightGrams.lte(0)) {
      throw new CustomerNotEligibleForOrderException('Weight must be greater than zero');
    }
    if (purityRatio.lte(0) || purityRatio.gt(1)) {
      throw new CustomerNotEligibleForOrderException(
        'Purity ratio must be between 0 (exclusive) and 1 (inclusive)',
      );
    }

    // ── 3. Call Pricing Engine ────────────────────────────────────
    // The engine persists a PricingCalculation record and returns its ID.
    const pricing = await this.pricingEngine.calculate({
      weightGrams,
      purityRatio,
      customerType: customer.type as CustomerType | undefined,
      priceSnapshotId: dto.priceSnapshotId,
      referenceType: 'ORDER',
    });

    const totalAmountRial = pricing.finalPrice;

    // Derive unit price per gram from the pricing pipeline result.
    // step4AfterWeight = price per gram × weight; so unit price = step4AfterWeight / weight.
    // We store this as the per-gram price for the OrderItem.
    const unitPriceRial = pricing.step4AfterWeight.dividedBy(weightGrams);

    // ── 4. Create Order + OrderItem atomically ────────────────────
    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.orderRepo.nextOrderNumber(tx);

      return this.orderRepo.createInTx(tx, {
        orderNumber,
        customerId: customer.id,
        customerAccountId: account.id,
        pricingCalculationId: pricing.calculationId,
        totalAmountRial,
        weightGrams,
        purityRatio,
        customerType: customer.type as CustomerType | null,
        item: {
          weightGrams,
          purityRatio,
          unitPriceRial,
          totalPriceRial: totalAmountRial,
          ...(dto.side ? { metadata: { side: dto.side } } : {}),
        },
      });
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_CREATED',
      entityType: 'Order',
      entityId: order.id,
      after: {
        orderNumber: order.orderNumber,
        status: order.status,
        totalAmountRial: order.totalAmountRial.toFixed(2),
        weightGrams: order.weightGrams.toFixed(6),
        purityRatio: order.purityRatio.toFixed(6),
        pricingCalculationId: order.pricingCalculationId,
      },
    });

    this.logger.log(
      `Order created: ${order.orderNumber} for customer ${customer.id} ` +
        `(total: ${totalAmountRial.toFixed(2)} Rial)`,
    );

    return this.toResponse(order, []);
  }

  // ─── Submit Order (DRAFT → SUBMITTED + credit reservation) ───

  /**
   * Submits a DRAFT order:
   *   1. Reserves credit (DRAFT → SUBMITTED) — atomic, concurrent-safe
   *   2. Auto-generates Quotation (SUBMITTED → QUOTED) — UC-08, BR-O02
   *
   * Phase 3.4 extension: Quotation is generated immediately after credit
   * reservation. The Order transitions all the way from DRAFT to QUOTED.
   *
   * ATOMICITY:
   *   TX1 (credit reservation + SUBMITTED) is separate from TX2 (Quotation creation + QUOTED).
   *   If TX2 fails, Order stays in SUBMITTED. This is recoverable — document can be
   *   regenerated by support or a future retry mechanism.
   *
   * CONCURRENCY: SELECT FOR UPDATE in TX1 prevents credit oversubscription (§3.4).
   * HARD BLOCK: credit < order total → InsufficientCreditException (§3.4, no override).
   * PRICE LOCK: Quotation uses the PricingCalculation locked at Order creation (§2.1).
   *
   * docs/21-business-decisions.md §3.3, §3.4, §2.1, §2.2, UC-08
   */
  async submitOrder(actorUserId: string, orderId: string): Promise<OrderResponseDto> {
    await this.tradingPolicy.assertTradingOpen();

    // ── 1. Resolve Customer ───────────────────────────────────────
    const { customer } = await this.resolveCustomerAndAccount(actorUserId);

    // ── 2. Load Order (customer isolation) ───────────────────────
    const order = await this.orderRepo.findByIdForCustomer(orderId, customer.id);
    if (!order) throw new OrderNotFoundException(orderId);

    if (order.customerId !== customer.id) throw new OrderAccessDeniedException();

    // ── 3. Validate state transition ──────────────────────────────
    if (!order.canSubmit()) {
      throw new InvalidOrderStateTransitionException(order.status, 'submit');
    }

    const reserveAmount = order.totalAmountRial;

    // ── 4. TX1: Atomic credit reservation + DRAFT → SUBMITTED ────
    // SELECT FOR UPDATE prevents concurrent oversubscription (§3.4).
    await this.prisma.$transaction(async (tx) => {
      await this.accountRepo.reserveCredit({
        tx,
        customerId: customer.id,
        amount: reserveAmount,
        orderId,
        actorId: actorUserId,
      });
      await this.orderRepo.submitInTx(tx, orderId, reserveAmount);
    });

    // ── 5. Audit: ORDER_SUBMITTED ──────────────────────────────────
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_SUBMITTED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: OrderStatus.DRAFT },
      after: { status: OrderStatus.SUBMITTED, reservedAmountRial: reserveAmount.toFixed(2) },
    });

    this.logger.log(
      `Order submitted: ${order.orderNumber} — reserved ${reserveAmount.toFixed(2)} Rial`,
    );

    // Notify customer — docs/16: "order received"
    // Notify internal staff — docs/16: "new order" (recipient=null for system-level)
    this.prisma.customer
      .findUnique({ where: { id: order.customerId }, select: { userId: true, mobile: true } })
      .then((cust) => {
        this.notificationService
          .dispatch({
            recipientId: cust?.userId ?? null,
            type: NotificationType.ORDER_RECEIVED,
            subject: 'سفارش شما ثبت شد',
            body: `سفارش شماره ${order.orderNumber} با موفقیت ثبت شد و در حال بررسی است.`,
            relatedEntityType: 'Order',
            relatedEntityId: orderId,
          })
          .catch(() => undefined);
        // Internal notification to staff (no specific recipient)
        this.notificationService
          .dispatch({
            recipientId: null,
            type: NotificationType.INTERNAL_NEW_ORDER,
            subject: 'سفارش جدید',
            body: `سفارش جدید ${order.orderNumber} ثبت شد.`,
            relatedEntityType: 'Order',
            relatedEntityId: orderId,
          })
          .catch(() => undefined);
      })
      .catch((err: unknown) =>
        this.logger.error(`[OrdersService] ORDER_RECEIVED notification failed: ${err}`),
      );

    // ── 6. Auto-generate Quotation (SUBMITTED → QUOTED) ───────────
    // UC-08: System generates Quotation automatically after Order submission.
    // Loads the PricingCalculation snapshot (already locked at Order creation — §2.1).
    // This is transaction-safe: TX2 is separate but idempotent (unique on orderId+version).
    if (order.pricingCalculationId) {
      const calc = await this.prisma.pricingCalculation.findUnique({
        where: { id: order.pricingCalculationId },
        select: {
          step1BasePrice: true,
          wageAmount: true,
          discountAmount: true,
          roundingAmount: true,
          isComplete: true,
          blockedSteps: true,
        },
      });

      const customerProfile = await this.prisma.customer.findUnique({
        where: { id: customer.id },
        select: { firstName: true, lastName: true },
      });

      await this.quotationsService.generateForOrder({
        orderId,
        orderNumber: order.orderNumber,
        customerId: customer.id,
        customerName: customerProfile
          ? `${customerProfile.firstName} ${customerProfile.lastName}`.trim()
          : customer.id,
        customerType: customer.type,
        pricingCalculationId: order.pricingCalculationId,
        totalAmountRial: order.totalAmountRial,
        weightGrams: order.weightGrams,
        purityRatio: order.purityRatio,
        step1BasePrice: new Decimal(calc?.step1BasePrice?.toString() ?? '0'),
        wageAmount: new Decimal(calc?.wageAmount?.toString() ?? '0'),
        discountAmount: new Decimal(calc?.discountAmount?.toString() ?? '0'),
        roundingAmount: new Decimal(calc?.roundingAmount?.toString() ?? '0'),
        isComplete: calc?.isComplete ?? false,
        blockedSteps: Array.isArray(calc?.blockedSteps) ? (calc.blockedSteps as string[]) : [],
        // Unit price per gram: total ÷ weight (from the locked calculation)
        unitPriceRial: order.totalAmountRial.dividedBy(order.weightGrams),
        actorId: actorUserId,
      });
    }

    // ── 7. Reload and return (Order is now QUOTED) ─────────────────
    const updated = await this.orderRepo.findById(orderId);
    if (!updated) throw new OrderNotFoundException(orderId);
    return this.toResponse(updated, []);
  }

  // ─── Cancel Order ─────────────────────────────────────────────

  /**
   * Cancels an order.
   *
   * Customer path (§4.1):
   *   - `allow_customer_cancellation` must be true (Store config)
   *   - Order must be in DRAFT or SUBMITTED
   *   - If SUBMITTED: credit is released atomically
   *
   * Staff path (order.cancel permission):
   *   - Any state before TRADE_CREATED
   *   - If SUBMITTED (or later with credit reserved): credit released atomically
   *
   * Credit release (§3.5): immediate and automatic, no manual step.
   *
   * docs/21-business-decisions.md §3.5, §4.1
   */
  async cancelOrder(
    actorUserId: string,
    orderId: string,
    dto: CancelOrderDto,
    isStaff: boolean,
  ): Promise<OrderResponseDto> {
    // ── 1. Load Order ─────────────────────────────────────────────
    let order: OrderEntity;
    if (isStaff) {
      const found = await this.orderRepo.findById(orderId);
      if (!found) throw new OrderNotFoundException(orderId);
      order = found;
    } else {
      // Customers: must own the order
      const { customer } = await this.resolveCustomerAndAccount(actorUserId);
      const found = await this.orderRepo.findByIdForCustomer(orderId, customer.id);
      if (!found) throw new OrderNotFoundException(orderId);
      order = found;
    }

    // ── 2. Check state ────────────────────────────────────────────
    if (!order.canCancel()) {
      throw new InvalidOrderStateTransitionException(order.status, 'cancel');
    }

    // ── 3. Customer cancellation policy check (§4.1) ──────────────
    if (!isStaff) {
      const store = await this.prisma.store.findFirst({
        select: { allowCustomerCancellation: true },
      });
      const allowed = store?.allowCustomerCancellation ?? true;
      if (!allowed) {
        throw new CustomerCancellationDisabledException();
      }
    }

    // ── 4. Cancel (with or without credit release) ─────────────────
    // Phase 3.4: also expire any ACTIVE Quotations atomically with credit release.
    // §2.3: Quotation → EXPIRED when Order is cancelled (NOT time-based).
    if (order.hasCreditReserved()) {
      // Order was SUBMITTED or later: release credit + cancel order + expire Quotation + cancel Assignments
      // All changes are in a single transaction — atomic.
      await this.prisma.$transaction(async (tx) => {
        await this.accountRepo.releaseCredit({
          tx,
          customerId: order.customerId,
          amount: order.reservedAmountRial,
          orderId,
          actorId: actorUserId,
          reason: `Order ${order.orderNumber} cancelled: ${dto.reason}`,
        });
        await this.orderRepo.cancelInTx(tx, orderId, {
          cancellationReason: dto.reason,
          cancelledByUserId: actorUserId,
        });
        // Expire any ACTIVE Quotations (§2.3)
        await this.quotationsService.expireForOrderInTx(tx, orderId, actorUserId);
        // Phase 3.5: Cancel any active Assignments (Order is terminated)
        await tx.assignment.updateMany({
          where: { orderId, status: 'ACTIVE' },
          data: { status: 'CANCELLED', completedAt: new Date(), updatedAt: new Date() },
        });
      });

      // Post-transaction: audit Quotation expiry
      await this.quotationsService.auditQuotationExpiry(orderId, actorUserId);
    } else {
      // Order was DRAFT: no credit reserved, no Quotation exists
      await this.orderRepo.cancelDraft(orderId, {
        cancellationReason: dto.reason,
        cancelledByUserId: actorUserId,
      });
    }

    // ── 5. Audit ──────────────────────────────────────────────────
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_CANCELLED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: {
        status: OrderStatus.CANCELLED,
        cancellationReason: dto.reason,
        creditReleased: order.hasCreditReserved() ? order.reservedAmountRial.toFixed(2) : '0.00',
      },
      reason: dto.reason,
    });

    this.logger.log(
      `Order cancelled: ${order.orderNumber} by user ${actorUserId}` +
        (order.hasCreditReserved()
          ? ` — released ${order.reservedAmountRial.toFixed(2)} Rial`
          : ''),
    );

    const updated = await this.orderRepo.findById(orderId);
    if (!updated) throw new OrderNotFoundException(orderId);
    return this.toResponse(updated, []);
  }

  // ─── Reject Order (state + credit release) ────────────────────

  /**
   * Rejects an order (staff/reviewer action).
   *
   * Phase 3.3: implements state transition and credit release.
   * Full Reviewer assignment workflow is Phase 3.4+.
   *
   * ATOMICITY: credit release and status update are in one transaction.
   *
   * docs/21-business-decisions.md §3.5
   */
  async rejectOrder(
    actorUserId: string,
    orderId: string,
    dto: RejectOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundException(orderId);

    if (!order.canReject()) {
      throw new InvalidOrderStateTransitionException(order.status, 'reject');
    }

    if (order.hasCreditReserved()) {
      // Phase 3.4/3.5: expire Quotation + complete Assignments atomically with credit release
      await this.prisma.$transaction(async (tx) => {
        await this.accountRepo.releaseCredit({
          tx,
          customerId: order.customerId,
          amount: order.reservedAmountRial,
          orderId,
          actorId: actorUserId,
          reason: `Order ${order.orderNumber} rejected: ${dto.reason}`,
        });
        await this.orderRepo.rejectInTx(tx, orderId, {
          rejectionReason: dto.reason,
          rejectedByUserId: actorUserId,
        });
        // Expire any ACTIVE Quotations (§2.3 — applies to rejection too)
        await this.quotationsService.expireForOrderInTx(tx, orderId, actorUserId);
        // Phase 3.5: Complete any active Assignments (review decision reached)
        await tx.assignment.updateMany({
          where: { orderId, status: 'ACTIVE' },
          data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() },
        });
      });

      // Post-transaction: audit Quotation expiry
      await this.quotationsService.auditQuotationExpiry(orderId, actorUserId);
    } else {
      // No credit reserved (e.g. rejected from DRAFT — unlikely but safe)
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'REJECTED',
          rejectionReason: dto.reason,
          rejectedByUserId: actorUserId,
          rejectedAt: new Date(),
        },
      });
    }

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_REJECTED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: {
        status: OrderStatus.REJECTED,
        rejectionReason: dto.reason,
        creditReleased: order.hasCreditReserved() ? order.reservedAmountRial.toFixed(2) : '0.00',
      },
      reason: dto.reason,
    });

    this.logger.log(`Order rejected: ${order.orderNumber} by user ${actorUserId}`);

    const updated = await this.orderRepo.findById(orderId);
    if (!updated) throw new OrderNotFoundException(orderId);
    return this.toResponse(updated, []);
  }

  // ─── Approve Order (ASSIGNED/UNDER_REVIEW → APPROVED) ────────

  /**
   * Approves an Order after manual review.
   *
   * Phase 3.5: Order transitions to APPROVED state.
   * Trade creation happens in a later phase (Phase 3.6+, UC-11).
   *
   * CREDIT: Credit is NOT consumed here. Credit consumption (reserved → consumed)
   * happens at Trade approval when Trade is formally confirmed (§3.3).
   * This approval marks the Order as ready for Trade creation.
   *
   * DUAL APPROVAL: §13.4 — OPEN (threshold undefined).
   * Single approval is implemented. Dual approval is BLOCKED.
   *
   * CONCURRENCY: State check is performed inside the transaction.
   * If another reviewer has already approved/rejected, the state check
   * inside the transaction will fail safely.
   *
   * docs/21-business-decisions.md §5.1
   */
  async approveOrder(
    actorUserId: string,
    orderId: string,
    dto: ApproveOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundException(orderId);

    if (!order.canApprove()) {
      throw new InvalidOrderStateTransitionException(order.status, 'approve');
    }

    // Atomic: update Order status + complete active Assignment
    await this.prisma.$transaction(async (tx) => {
      // Concurrency guard: re-read status inside transaction
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (fresh?.status !== 'ASSIGNED' && fresh?.status !== 'UNDER_REVIEW') {
        throw new InvalidOrderStateTransitionException(
          (fresh?.status ?? 'UNKNOWN') as OrderStatus,
          'approve',
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'APPROVED', updatedAt: new Date() },
      });

      // Complete any active assignment for this order
      await tx.assignment.updateMany({
        where: { orderId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() },
      });
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_APPROVED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: {
        status: OrderStatus.APPROVED,
        approvedByUserId: actorUserId,
        notes: dto.notes ?? null,
        creditConsumed: false, // credit NOT consumed here — happens at Trade approval
      },
      reason: dto.notes,
    });

    this.logger.log(
      `Order ${order.orderNumber} approved by user ${actorUserId}. ` +
        `Note: Trade creation pending (Phase 3.6+). Credit NOT consumed yet.`,
    );

    const updated = await this.orderRepo.findById(orderId);
    if (!updated) throw new OrderNotFoundException(orderId);
    return this.toResponse(updated, []);
  }

  // ─── Request Revision (ASSIGNED/UNDER_REVIEW → REVISION_REQUESTED) ──

  /**
   * Requests a revision of an Order after review.
   *
   * Phase 3.5: Order transitions to REVISION_REQUESTED.
   *
   * BLOCKED (§8.3): The documentation defines workflow step
   * "Customer/Operator Updates → New Quotation Version → Review Again"
   * but does NOT specify what can be modified (price is locked at §2.1;
   * weight/purity are fixed at Order creation).
   *
   * IMPLEMENTED in this phase:
   *   - ASSIGNED/UNDER_REVIEW → REVISION_REQUESTED transition
   *   - Assignment marked as COMPLETED
   *   - Audit log
   *
   * NOT IMPLEMENTED (BLOCKED on §8.3):
   *   - REVISION_REQUESTED → QUOTED path (new Quotation version generation)
   *   - What fields can be modified
   *   - Who triggers the re-quotation
   *
   * BR-O07: Revision must have trackable versioning/history.
   * docs/08-workflows.md §8.3
   */
  async requestRevision(
    actorUserId: string,
    orderId: string,
    dto: RequestRevisionDto,
  ): Promise<OrderResponseDto> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new OrderNotFoundException(orderId);

    if (!order.canRequestRevision()) {
      throw new InvalidOrderStateTransitionException(order.status, 'requestRevision');
    }

    // Atomic: update Order status + complete active Assignment
    await this.prisma.$transaction(async (tx) => {
      // Concurrency guard: re-read status inside transaction
      const fresh = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      if (fresh?.status !== 'ASSIGNED' && fresh?.status !== 'UNDER_REVIEW') {
        throw new InvalidOrderStateTransitionException(
          (fresh?.status ?? 'UNKNOWN') as OrderStatus,
          'requestRevision',
        );
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: 'REVISION_REQUESTED', updatedAt: new Date() },
      });

      // Complete any active assignment (reviewer has made a decision)
      await tx.assignment.updateMany({
        where: { orderId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() },
      });
    });

    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'ORDER_REVISION_REQUESTED',
      entityType: 'Order',
      entityId: orderId,
      before: { status: order.status },
      after: { status: OrderStatus.REVISION_REQUESTED, revisionReason: dto.reason },
      reason: dto.reason,
    });

    this.logger.log(
      `Revision requested for Order ${order.orderNumber} by user ${actorUserId}. ` +
        `Reason: ${dto.reason}. ` +
        `NOTE: REVISION_REQUESTED→QUOTED path is BLOCKED pending §8.3 resolution.`,
    );

    const updated = await this.orderRepo.findById(orderId);
    if (!updated) throw new OrderNotFoundException(orderId);
    return this.toResponse(updated, []);
  }

  // ─── Queries ──────────────────────────────────────────────────

  /**
   * Lists orders.
   *
   * Customer: sees only their own orders (customer isolation).
   * Staff (order.read): can filter by status or customerId.
   */
  async listOrders(
    actorUserId: string,
    dto: ListOrdersDto,
    isStaff: boolean,
  ): Promise<{ orders: OrderResponseDto[]; meta: PaginationMeta }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    let orders: OrderEntity[];
    let total: number;

    if (isStaff) {
      const result = await this.orderRepo.findAll({
        page,
        limit,
        status: dto.status,
        customerId: dto.customerId,
      });
      orders = result.orders;
      total = result.total;
    } else {
      const { customer } = await this.resolveCustomerAndAccount(actorUserId);
      const result = await this.orderRepo.findByCustomerId(customer.id, { page, limit });
      orders = result.orders;
      total = result.total;
    }

    return {
      orders: orders.map((o) => this.toResponse(o, [])),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Gets a single order detail.
   *
   * Customer: only own orders (customer isolation enforced here).
   * Staff: any order.
   */
  async getOrderDetail(
    actorUserId: string,
    orderId: string,
    isStaff: boolean,
  ): Promise<OrderResponseDto> {
    if (isStaff) {
      const order = await this.orderRepo.findById(orderId);
      if (!order) throw new OrderNotFoundException(orderId);
      return this.toResponse(order, []);
    }

    const { customer } = await this.resolveCustomerAndAccount(actorUserId);
    const order = await this.orderRepo.findByIdForCustomer(orderId, customer.id);
    if (!order) throw new OrderNotFoundException(orderId);
    return this.toResponse(order, []);
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Resolves and validates the Customer and CustomerAccount for the authenticated user.
   *
   * Business rules enforced:
   *   - User must have a Customer profile
   *   - Customer KYC must be APPROVED (CustomerStatus.ACTIVE means KYC passed)
   *   - CustomerAccount must be ACTIVE
   *
   * docs/21-business-decisions.md §3.3 — implied: only approved customers can order
   */
  private async resolveCustomerAndAccount(actorUserId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId: actorUserId },
      select: {
        id: true,
        type: true,
        status: true,
        accountStatus: true,
        account: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!customer) {
      throw new CustomerNotEligibleForOrderException(
        'No customer profile found for this account. Please complete registration.',
      );
    }

    // Customer must be ACTIVE (= KYC approved + account activated)
    if (customer.accountStatus != null && customer.accountStatus !== 'ACTIVE') {
      throw new CustomerNotEligibleForOrderException('Customer account is inactive or blocked.');
    }

    if (customer.status !== CustomerStatus.ACTIVE) {
      throw new CustomerNotEligibleForOrderException(
        `Customer account is not active (current status: ${customer.status}). ` +
          'Orders can only be placed by customers with an ACTIVE status.',
      );
    }

    if (!customer.account) {
      throw new CustomerNotEligibleForOrderException(
        'Customer account record not found. Please contact support.',
      );
    }

    if (customer.account.status !== 'ACTIVE') {
      throw new CustomerNotEligibleForOrderException(
        `Customer credit account is ${customer.account.status}. Cannot place orders.`,
      );
    }

    return { customer, account: customer.account };
  }

  // ─── Response mapping ─────────────────────────────────────────

  private toResponse(order: OrderEntity, _items: OrderItemEntity[]): OrderResponseDto {
    const dto = new OrderResponseDto();
    dto.id = order.id;
    dto.orderNumber = order.orderNumber;
    dto.customerId = order.customerId;
    dto.customerAccountId = order.customerAccountId;
    dto.pricingCalculationId = order.pricingCalculationId;
    dto.status = order.status;
    dto.totalAmountRial = order.totalAmountRial.toFixed(2);
    dto.reservedAmountRial = order.reservedAmountRial.toFixed(2);
    dto.weightGrams = order.weightGrams.toFixed(6);
    dto.purityRatio = order.purityRatio.toFixed(6);
    dto.customerType = order.customerType;
    dto.submittedAt = order.submittedAt;
    dto.cancelledAt = order.cancelledAt;
    dto.rejectedAt = order.rejectedAt;
    dto.cancellationReason = order.cancellationReason;
    dto.rejectionReason = order.rejectionReason;
    dto.createdAt = order.createdAt;
    dto.updatedAt = order.updatedAt;
    dto.items = [];
    return dto;
  }
}
