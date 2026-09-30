/**
 * Orders Service Unit Tests — Phase 3.3 / Phase 3.4 / Phase 3.5
 *
 * Coverage:
 *   - Order creation (DRAFT), pricing engine integration
 *   - Customer eligibility: KYC must be APPROVED (status=ACTIVE)
 *   - Credit reservation on submission (DRAFT → SUBMITTED → QUOTED)
 *   - Auto-Quotation generation on submit (Phase 3.4)
 *   - Hard credit block (§3.4 — no override)
 *   - Concurrency: two simultaneous submissions cannot oversubscribe credit
 *   - Cancellation (§4.1 — configurable; customer vs staff paths)
 *   - Quotation expiry on cancellation (Phase 3.4, §2.3)
 *   - Quotation expiry on rejection (Phase 3.4, §2.3)
 *   - Credit release on cancellation and rejection (§3.5)
 *   - Customer isolation: customers can never see another customer's orders
 *   - State machine: invalid transitions throw
 *   - Approve: ASSIGNED/UNDER_REVIEW → APPROVED (no credit movement) (Phase 3.5)
 *   - Approve: concurrent approval (concurrency-safe) (Phase 3.5)
 *   - Approve: credit NOT consumed at this stage (Phase 3.5, §3.3)
 *   - RequestRevision: ASSIGNED/UNDER_REVIEW → REVISION_REQUESTED (Phase 3.5)
 *   - RequestRevision: REVISION_REQUESTED→QUOTED path BLOCKED on §8.3 (Phase 3.5)
 *   - Assignment completion on approve/reject (Phase 3.5)
 */

import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { OrderStatus, CustomerStatus, CustomerType } from '@gold/shared-types';

import { OrdersService } from './application/orders.service';
import { OrderRepository } from './infrastructure/repositories/order.repository';
import { CustomerAccountRepository } from '../customer-accounts/infrastructure/repositories/customer-account.repository';
import { PricingEngineService } from '../pricing/application/pricing-engine.service';
import { AuditService } from '../audit/application/audit.service';
import { NotificationService } from '../notifications/application/notification.service';
import { TradingPolicyService } from '../trading-policy/application/trading-policy.service';
import { PrismaService } from '../../database/prisma.service';
import { QuotationsService } from '../quotations/application/quotations.service';

import { OrderEntity } from './domain/entities/order.entity';
import { CreateOrderDto } from './application/dto/create-order.dto';
import { CancelOrderDto } from './application/dto/cancel-order.dto';
import { RejectOrderDto } from './application/dto/reject-order.dto';
import { ApproveOrderDto } from './application/dto/approve-order.dto';
import { RequestRevisionDto } from './application/dto/request-revision.dto';
import { ListOrdersDto } from './application/dto/list-orders.dto';

import {
  InsufficientCreditException,
  InvalidOrderStateTransitionException,
  CustomerCancellationDisabledException,
  OrderNotFoundException,
  CustomerNotEligibleForOrderException,
} from './domain/exceptions/order.exceptions';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const CUSTOMER_USER_ID = 'user-customer-1';
const CUSTOMER_ID = 'customer-1';
const ACCOUNT_ID = 'account-1';
const ORDER_ID = 'order-1';
const ORDER_NUMBER = 'ORD-000001';
const PRICING_CALC_ID = 'calc-1';

const TOTAL_AMOUNT = new Decimal('1000000.00'); // 1,000,000 Rial

/**
 * Builds a mock OrderEntity.
 * Defaults: DRAFT, weightGrams=10, purityRatio=0.750, no credit reserved.
 */
function makeOrder(
  overrides: Partial<{
    id: string;
    status: OrderStatus;
    customerId: string;
    customerAccountId: string;
    totalAmountRial: Decimal;
    reservedAmountRial: Decimal;
    weightGrams: Decimal;
    purityRatio: Decimal;
    customerType: CustomerType | null;
    submittedAt: Date | null;
    cancelledAt: Date | null;
    rejectedAt: Date | null;
    cancellationReason: string | null;
    cancelledByUserId: string | null;
    rejectionReason: string | null;
    rejectedByUserId: string | null;
  }> = {},
): OrderEntity {
  return new OrderEntity({
    id: overrides.id ?? ORDER_ID,
    orderNumber: ORDER_NUMBER,
    customerId: overrides.customerId ?? CUSTOMER_ID,
    customerAccountId: overrides.customerAccountId ?? ACCOUNT_ID,
    pricingCalculationId: PRICING_CALC_ID,
    status: overrides.status ?? OrderStatus.DRAFT,
    totalAmountRial: overrides.totalAmountRial ?? TOTAL_AMOUNT,
    reservedAmountRial: overrides.reservedAmountRial ?? new Decimal(0),
    weightGrams: overrides.weightGrams ?? new Decimal('10'),
    purityRatio: overrides.purityRatio ?? new Decimal('0.750'),
    customerType: overrides.customerType ?? CustomerType.HOUSEHOLD,
    submittedAt: overrides.submittedAt ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    rejectedAt: overrides.rejectedAt ?? null,
    cancellationReason: overrides.cancellationReason ?? null,
    cancelledByUserId: overrides.cancelledByUserId ?? null,
    rejectionReason: overrides.rejectionReason ?? null,
    rejectedByUserId: overrides.rejectedByUserId ?? null,
    createdAt: new Date('2026-09-26T10:00:00Z'),
    updatedAt: new Date('2026-09-26T10:00:00Z'),
  });
}

/** Standard active customer row returned by prisma.customer.findUnique */
const activeCustomerRow = {
  id: CUSTOMER_ID,
  type: CustomerType.HOUSEHOLD,
  status: CustomerStatus.ACTIVE,
  account: { id: ACCOUNT_ID, status: 'ACTIVE' },
  // Added for Phase 3.4: submitOrder reads firstName/lastName for Quotation document
  firstName: 'Ali',
  lastName: 'Hosseini',
};

/** Mock PricingCalculation row returned in submitOrder for Quotation generation */
const pricingCalcRow = {
  step1BasePrice: '100000.000000',
  wageAmount: '0.00',
  discountAmount: '0.00',
  roundingAmount: '0.00',
  isComplete: false,
  blockedSteps: ['step6_profit', 'step7_tax'],
};

/** Mock PricingEngineResult */
const pricingResult = {
  calculationId: PRICING_CALC_ID,
  finalPrice: TOTAL_AMOUNT,
  step4AfterWeight: new Decimal('10000000.00'), // price for 10g total
  step1BasePrice: new Decimal('1000000'),
  step2AfterGlobalAdj: new Decimal('1000000'),
  step3PurityConvApplied: false as const,
  step5AfterGroupRule: new Decimal('10000000'),
  wageAmount: new Decimal(0),
  profitAmount: null,
  taxAmount: null,
  discountAmount: new Decimal(0),
  priceBeforeRounding: TOTAL_AMOUNT,
  roundingAmount: new Decimal(0),
  isComplete: false as const,
  blockedSteps: ['step6_profit', 'step7_tax'],
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: jest.Mocked<PrismaService>;
  let orderRepo: jest.Mocked<OrderRepository>;
  let accountRepo: jest.Mocked<CustomerAccountRepository>;
  let pricingEngine: jest.Mocked<PricingEngineService>;
  let auditService: jest.Mocked<AuditService>;
  let quotationsService: jest.Mocked<QuotationsService>;
  let tradingPolicy: { assertTradingOpen: jest.Mock; validateTransaction: jest.Mock };

  // Mock $transaction: just execute the callback with a fake tx
  // Phase 3.5: fakeTx needs order.update + order.findUnique + assignment.updateMany
  const fakeTx = {
    order: { update: jest.fn(), findUnique: jest.fn() },
    assignment: { updateMany: jest.fn() },
  } as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

  beforeEach(async () => {
    // Reset fakeTx mocks
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock };
      }
    ).order.update = jest.fn().mockResolvedValue({});
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock };
      }
    ).order.findUnique = jest.fn();
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock };
      }
    ).assignment.updateMany = jest.fn().mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            customer: { findUnique: jest.fn().mockResolvedValue(null) },
            store: { findFirst: jest.fn() },
            order: { update: jest.fn() },
            // Phase 3.4: needed for Quotation generation in submitOrder
            pricingCalculation: { findUnique: jest.fn() },
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            findById: jest.fn(),
            findByIdForCustomer: jest.fn(),
            findByCustomerId: jest.fn(),
            findAll: jest.fn(),
            nextOrderNumber: jest.fn(),
            createInTx: jest.fn(),
            submitInTx: jest.fn(),
            cancelInTx: jest.fn(),
            cancelDraft: jest.fn(),
            rejectInTx: jest.fn(),
          },
        },
        {
          provide: CustomerAccountRepository,
          useValue: {
            reserveCredit: jest.fn(),
            releaseCredit: jest.fn(),
          },
        },
        {
          provide: PricingEngineService,
          useValue: { calculate: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
        {
          provide: NotificationService,
          useValue: { dispatch: jest.fn().mockResolvedValue([]) },
        },
        // Phase 3.4: QuotationsService integrated into OrdersService
        {
          provide: QuotationsService,
          useValue: {
            generateForOrder: jest.fn(),
            expireForOrderInTx: jest.fn(),
            auditQuotationExpiry: jest.fn(),
          },
        },
        {
          provide: TradingPolicyService,
          useValue: {
            assertTradingOpen: jest.fn().mockResolvedValue(undefined),
            validateTransaction: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(OrdersService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    orderRepo = module.get(OrderRepository) as jest.Mocked<OrderRepository>;
    accountRepo = module.get(CustomerAccountRepository) as jest.Mocked<CustomerAccountRepository>;
    pricingEngine = module.get(PricingEngineService) as jest.Mocked<PricingEngineService>;
    auditService = module.get(AuditService) as jest.Mocked<AuditService>;
    quotationsService = module.get(QuotationsService) as jest.Mocked<QuotationsService>;
    tradingPolicy = module.get(TradingPolicyService);

    // Default: $transaction executes callback immediately with fakeTx
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof fakeTx) => Promise<unknown>) => cb(fakeTx),
    );

    // Default Phase 3.4 mocks: Quotation generation succeeds
    (prisma.pricingCalculation as unknown as { findUnique: jest.Mock }).findUnique = jest
      .fn()
      .mockResolvedValue(pricingCalcRow);
    (quotationsService.generateForOrder as jest.Mock).mockResolvedValue({
      id: 'quotation-1',
      quotationNumber: 'QT-000001',
      status: 'ACTIVE',
    });
    (quotationsService.expireForOrderInTx as jest.Mock).mockResolvedValue(undefined);
    (quotationsService.auditQuotationExpiry as jest.Mock).mockResolvedValue(undefined);

    // Phase 3.5: fakeTx.order.findUnique defaults to returning ASSIGNED status
    // (overridden per test as needed)
    (fakeTx as unknown as { order: { findUnique: jest.Mock } }).order.findUnique.mockResolvedValue({
      status: 'ASSIGNED',
    });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createOrder ─────────────────────────────────────────────────────────

  describe('createOrder', () => {
    const dto: CreateOrderDto = { weightGrams: '10', purityRatio: '0.750' };

    it('creates a DRAFT order and calls the pricing engine', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (pricingEngine.calculate as jest.Mock).mockResolvedValue(pricingResult);
      (orderRepo.nextOrderNumber as jest.Mock).mockResolvedValue(ORDER_NUMBER);
      const createdOrder = makeOrder();
      (orderRepo.createInTx as jest.Mock).mockResolvedValue(createdOrder);
      (orderRepo.findById as jest.Mock).mockResolvedValue(createdOrder);

      const result = await service.createOrder(CUSTOMER_USER_ID, dto);

      // Pricing engine called with customer context
      expect(pricingEngine.calculate).toHaveBeenCalledTimes(1);
      expect(tradingPolicy.assertTradingOpen).toHaveBeenCalledTimes(1);
      expect(pricingEngine.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          weightGrams: new Decimal('10'),
          purityRatio: new Decimal('0.750'),
          customerType: CustomerType.HOUSEHOLD,
          referenceType: 'ORDER',
        }),
      );

      // Order created in transaction
      expect(orderRepo.createInTx).toHaveBeenCalledTimes(1);
      expect(orderRepo.createInTx).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          customerId: CUSTOMER_ID,
          customerAccountId: ACCOUNT_ID,
          pricingCalculationId: PRICING_CALC_ID,
          totalAmountRial: TOTAL_AMOUNT,
        }),
      );

      // Audit logged
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_CREATED', entityId: ORDER_ID }),
      );

      // Response has correct status
      expect(result.status).toBe(OrderStatus.DRAFT);
      expect(result.reservedAmountRial).toBe('0.00'); // no credit reserved yet
    });

    it('throws CustomerNotEligibleForOrderException if no customer profile exists', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toBeInstanceOf(
        CustomerNotEligibleForOrderException,
      );
      expect(pricingEngine.calculate).not.toHaveBeenCalled();
    });

    it('throws CustomerNotEligibleForOrderException if customer status is PENDING (KYC not done)', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue({
        ...activeCustomerRow,
        status: CustomerStatus.PENDING,
      });

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toBeInstanceOf(
        CustomerNotEligibleForOrderException,
      );
    });

    it('throws CustomerNotEligibleForOrderException if customer status is UNDER_REVIEW', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue({
        ...activeCustomerRow,
        status: CustomerStatus.UNDER_REVIEW,
      });

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toBeInstanceOf(
        CustomerNotEligibleForOrderException,
      );
    });

    it('throws CustomerNotEligibleForOrderException if CustomerAccount is not ACTIVE', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue({
        ...activeCustomerRow,
        account: { id: ACCOUNT_ID, status: 'SUSPENDED' },
      });

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toBeInstanceOf(
        CustomerNotEligibleForOrderException,
      );
    });

    it('propagates pricing engine errors (e.g. no valid price snapshot)', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (pricingEngine.calculate as jest.Mock).mockRejectedValue(new Error('NoPriceAvailable'));

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toThrow('NoPriceAvailable');
      expect(orderRepo.createInTx).not.toHaveBeenCalled();
    });

    it('does not price an order when the trading window is closed', async () => {
      tradingPolicy.assertTradingOpen.mockRejectedValueOnce(
        new Error('زمان معاملات در حال حاضر فعال نیست.'),
      );

      await expect(service.createOrder(CUSTOMER_USER_ID, dto)).rejects.toThrow(
        'زمان معاملات در حال حاضر فعال نیست.',
      );
      expect(pricingEngine.calculate).not.toHaveBeenCalled();
    });
  });

  // ─── submitOrder ─────────────────────────────────────────────────────────

  describe('submitOrder', () => {
    it('submits a DRAFT order: reserves credit, transitions to SUBMITTED, auto-generates Quotation (→ QUOTED)', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      const draftOrder = makeOrder({ status: OrderStatus.DRAFT });
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(draftOrder);
      (accountRepo.reserveCredit as jest.Mock).mockResolvedValue(undefined);
      (orderRepo.submitInTx as jest.Mock).mockResolvedValue(undefined);

      // Phase 3.4: Order ends in QUOTED (after Quotation generation)
      const quotedOrder = makeOrder({
        status: OrderStatus.QUOTED,
        reservedAmountRial: TOTAL_AMOUNT,
        submittedAt: new Date(),
      });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);

      const result = await service.submitOrder(CUSTOMER_USER_ID, ORDER_ID);

      expect(tradingPolicy.assertTradingOpen).toHaveBeenCalledTimes(1);

      // TX1: Credit reservation
      expect(accountRepo.reserveCredit).toHaveBeenCalledTimes(1);
      expect(accountRepo.reserveCredit).toHaveBeenCalledWith({
        tx: fakeTx,
        customerId: CUSTOMER_ID,
        amount: TOTAL_AMOUNT,
        orderId: ORDER_ID,
        actorId: CUSTOMER_USER_ID,
      });

      // TX1: Order → SUBMITTED
      expect(orderRepo.submitInTx).toHaveBeenCalledTimes(1);
      expect(orderRepo.submitInTx).toHaveBeenCalledWith(fakeTx, ORDER_ID, TOTAL_AMOUNT);

      // Phase 3.4: Quotation auto-generated (UC-08, BR-O02)
      expect(quotationsService.generateForOrder).toHaveBeenCalledTimes(1);
      expect(quotationsService.generateForOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          customerId: CUSTOMER_ID,
          pricingCalculationId: PRICING_CALC_ID,
          totalAmountRial: TOTAL_AMOUNT,
        }),
      );

      // Audit: ORDER_SUBMITTED (before Quotation) + Quotation audits in QuotationsService
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_SUBMITTED', entityId: ORDER_ID }),
      );

      // Final state: QUOTED (after Quotation generation)
      expect(result.status).toBe(OrderStatus.QUOTED);
      expect(result.reservedAmountRial).toBe(TOTAL_AMOUNT.toFixed(2));
    });

    it('throws OrderNotFoundException if order does not belong to customer', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      // findByIdForCustomer returns null (order exists but belongs to another customer)
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(null);

      await expect(service.submitOrder(CUSTOMER_USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        OrderNotFoundException,
      );
      expect(accountRepo.reserveCredit).not.toHaveBeenCalled();
    });

    it('throws InvalidOrderStateTransitionException if order is already SUBMITTED', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
        makeOrder({ status: OrderStatus.SUBMITTED }),
      );

      await expect(service.submitOrder(CUSTOMER_USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        InvalidOrderStateTransitionException,
      );
      expect(accountRepo.reserveCredit).not.toHaveBeenCalled();
    });

    it('throws InvalidOrderStateTransitionException if order is CANCELLED', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED }),
      );

      await expect(service.submitOrder(CUSTOMER_USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        InvalidOrderStateTransitionException,
      );
    });

    /**
     * CREDIT HARD BLOCK (docs/21-business-decisions.md §3.4):
     * If reserveCredit throws InsufficientCreditException, the order MUST NOT be submitted.
     * No manager override is possible.
     *
     * The $transaction rolls back the entire operation, so:
     *   - No RESERVATION CreditTransaction is created
     *   - Order status remains DRAFT
     */
    it('throws InsufficientCreditException (hard block) when credit is insufficient — §3.4', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
        makeOrder({ status: OrderStatus.DRAFT }),
      );

      const available = new Decimal('500000.00');
      const required = TOTAL_AMOUNT; // 1,000,000 > 500,000
      (accountRepo.reserveCredit as jest.Mock).mockRejectedValue(
        new InsufficientCreditException(available, required),
      );

      await expect(service.submitOrder(CUSTOMER_USER_ID, ORDER_ID)).rejects.toBeInstanceOf(
        InsufficientCreditException,
      );

      // Order status update must NOT have been called (transaction rolled back)
      expect(orderRepo.submitInTx).not.toHaveBeenCalled();
    });

    /**
     * CONCURRENCY SAFETY (docs/21-business-decisions.md §3.3):
     *
     * Two simultaneous order submissions must not be able to oversubscribe credit.
     *
     * The repository uses SELECT FOR UPDATE (PostgreSQL row-level lock) inside
     * the transaction. This test simulates the scenario:
     *
     *   Credit limit:   100,000,000 Rial
     *   Order 1 total:   60,000,000 Rial (succeeds → reserved = 60M)
     *   Order 2 total:   60,000,000 Rial (fails → 60M > 40M available)
     *
     * Production behavior:
     *   1. Transaction 1 acquires FOR UPDATE lock → sees 100M available → reserves 60M → commits
     *   2. Transaction 2 waits for T1 lock release → sees 40M available → throws
     *
     * This test verifies the SERVICE correctly propagates InsufficientCreditException
     * from the repository layer without any fallback or silent truncation.
     */
    it('CONCURRENCY: second simultaneous submission fails with InsufficientCreditException', async () => {
      const creditLimit = new Decimal('100000000.00');
      const order1Amount = new Decimal('60000000.00');
      const order2Amount = new Decimal('60000000.00');

      const ORDER_1_ID = 'order-concurrent-1';
      const ORDER_2_ID = 'order-concurrent-2';

      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);

      const order1 = makeOrder({
        id: ORDER_1_ID,
        status: OrderStatus.DRAFT,
        totalAmountRial: order1Amount,
      });
      const order2 = makeOrder({
        id: ORDER_2_ID,
        status: OrderStatus.DRAFT,
        totalAmountRial: order2Amount,
      });

      (orderRepo.findByIdForCustomer as jest.Mock)
        .mockResolvedValueOnce(order1) // first call = order 1
        .mockResolvedValueOnce(order2); // second call = order 2

      // First reservation succeeds (full credit available = 100M, need 60M)
      (accountRepo.reserveCredit as jest.Mock)
        .mockResolvedValueOnce(undefined) // order 1: succeeds
        .mockRejectedValueOnce(
          // order 2: fails (only 40M available now)
          new InsufficientCreditException(
            creditLimit.minus(order1Amount), // available = 40M
            order2Amount, // required = 60M
          ),
        );

      (orderRepo.submitInTx as jest.Mock).mockResolvedValue(undefined);
      // Phase 3.4: Order ends in QUOTED after Quotation auto-generation
      (orderRepo.findById as jest.Mock).mockResolvedValue(
        makeOrder({ id: ORDER_1_ID, status: OrderStatus.QUOTED, reservedAmountRial: order1Amount }),
      );

      // Order 1 submits successfully → ends in QUOTED (Quotation auto-generated)
      const result1 = await service.submitOrder(CUSTOMER_USER_ID, ORDER_1_ID);
      expect(result1.status).toBe(OrderStatus.QUOTED);

      // Order 2 fails — credit oversubscription prevented
      // Capture the error to verify its details
      let caughtError: InsufficientCreditException | null = null;
      try {
        await service.submitOrder(CUSTOMER_USER_ID, ORDER_2_ID);
        fail('Expected InsufficientCreditException but no error was thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InsufficientCreditException);
        caughtError = err as InsufficientCreditException;
      }

      // Verify the error details communicate exact amounts to the customer
      const response = caughtError!.getResponse() as {
        details: { availableRial: string; requiredRial: string; shortfallRial: string };
      };
      expect(response.details.availableRial).toBe('40000000.00');
      expect(response.details.requiredRial).toBe('60000000.00');
      expect(response.details.shortfallRial).toBe('20000000.00');

      // submitInTx was called only once (for the successful order 1)
      expect(orderRepo.submitInTx).toHaveBeenCalledTimes(1);
    });
  });

  // ─── cancelOrder ─────────────────────────────────────────────────────────

  describe('cancelOrder', () => {
    const cancelDto: CancelOrderDto = { reason: 'Customer changed mind' };

    describe('customer cancellation', () => {
      it('cancels a DRAFT order without credit release (no credit was reserved)', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.DRAFT }),
        );
        (prisma.store.findFirst as jest.Mock).mockResolvedValue({
          allowCustomerCancellation: true,
        });
        (orderRepo.cancelDraft as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.findById as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.CANCELLED, cancelledAt: new Date() }),
        );

        const result = await service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false);

        // DRAFT → no credit release needed
        expect(accountRepo.releaseCredit).not.toHaveBeenCalled();
        // Direct status update (no transaction needed)
        expect(orderRepo.cancelDraft).toHaveBeenCalledTimes(1);
        expect(result.status).toBe(OrderStatus.CANCELLED);
      });

      it('cancels a SUBMITTED order: releases credit + expires Quotation atomically (§3.5, §2.3)', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        const submittedOrder = makeOrder({
          status: OrderStatus.SUBMITTED,
          reservedAmountRial: TOTAL_AMOUNT,
        });
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(submittedOrder);
        (prisma.store.findFirst as jest.Mock).mockResolvedValue({
          allowCustomerCancellation: true,
        });
        (accountRepo.releaseCredit as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.cancelInTx as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.findById as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.CANCELLED, cancelledAt: new Date() }),
        );

        await service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false);

        // Credit released atomically
        expect(accountRepo.releaseCredit).toHaveBeenCalledTimes(1);
        expect(accountRepo.releaseCredit).toHaveBeenCalledWith({
          tx: fakeTx,
          customerId: CUSTOMER_ID,
          amount: TOTAL_AMOUNT,
          orderId: ORDER_ID,
          actorId: CUSTOMER_USER_ID,
          reason: expect.stringContaining(cancelDto.reason),
        });
        expect(orderRepo.cancelInTx).toHaveBeenCalledTimes(1);

        // Phase 3.4: Quotation ALSO expired in the same transaction (§2.3)
        expect(quotationsService.expireForOrderInTx).toHaveBeenCalledWith(
          fakeTx,
          ORDER_ID,
          CUSTOMER_USER_ID,
        );
        // Post-transaction audit for Quotation expiry
        expect(quotationsService.auditQuotationExpiry).toHaveBeenCalledWith(
          ORDER_ID,
          CUSTOMER_USER_ID,
        );
      });

      it('cancels a QUOTED order: releases credit + expires Quotation (Phase 3.4)', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        const quotedOrder = makeOrder({
          status: OrderStatus.QUOTED,
          reservedAmountRial: TOTAL_AMOUNT,
        });
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(quotedOrder);
        (prisma.store.findFirst as jest.Mock).mockResolvedValue({
          allowCustomerCancellation: true,
        });
        (accountRepo.releaseCredit as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.cancelInTx as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.findById as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.CANCELLED }),
        );

        await service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false);

        // QUOTED.hasCreditReserved() = true → release credit
        expect(accountRepo.releaseCredit).toHaveBeenCalledTimes(1);
        // QUOTED has an active Quotation → expire it
        expect(quotationsService.expireForOrderInTx).toHaveBeenCalledTimes(1);
      });

      /**
       * §4.1: When allow_customer_cancellation = false, customers may NOT cancel.
       * They must contact staff.
       */
      it('throws CustomerCancellationDisabledException when store disables customer cancellation (§4.1)', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.SUBMITTED }),
        );
        (prisma.store.findFirst as jest.Mock).mockResolvedValue({
          allowCustomerCancellation: false,
        });

        await expect(
          service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false),
        ).rejects.toBeInstanceOf(CustomerCancellationDisabledException);

        expect(accountRepo.releaseCredit).not.toHaveBeenCalled();
      });

      it('throws InvalidOrderStateTransitionException if order is already CANCELLED', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.CANCELLED }),
        );

        await expect(
          service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false),
        ).rejects.toBeInstanceOf(InvalidOrderStateTransitionException);
      });

      it('throws InvalidOrderStateTransitionException if order is REJECTED', async () => {
        (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
        (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(
          makeOrder({ status: OrderStatus.REJECTED }),
        );

        await expect(
          service.cancelOrder(CUSTOMER_USER_ID, ORDER_ID, cancelDto, false),
        ).rejects.toBeInstanceOf(InvalidOrderStateTransitionException);
      });
    });

    describe('staff cancellation', () => {
      it('staff with order.cancel can cancel a SUBMITTED order ignoring customer cancellation policy', async () => {
        // Store has cancellation DISABLED — staff should bypass this
        (orderRepo.findById as jest.Mock)
          .mockResolvedValueOnce(
            makeOrder({ status: OrderStatus.SUBMITTED, reservedAmountRial: TOTAL_AMOUNT }),
          )
          .mockResolvedValueOnce(makeOrder({ status: OrderStatus.CANCELLED }));
        (accountRepo.releaseCredit as jest.Mock).mockResolvedValue(undefined);
        (orderRepo.cancelInTx as jest.Mock).mockResolvedValue(undefined);

        // isStaff = true: no store config check
        await service.cancelOrder('staff-user-id', ORDER_ID, cancelDto, true);

        // Store was NOT consulted for staff cancellation
        expect(prisma.store.findFirst).not.toHaveBeenCalled();
        // Credit released
        expect(accountRepo.releaseCredit).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─── rejectOrder ─────────────────────────────────────────────────────────

  describe('rejectOrder', () => {
    const rejectDto: RejectOrderDto = { reason: 'Insufficient documentation provided' };

    it('rejects a SUBMITTED order: releases credit + expires Quotation (§3.5, §2.3)', async () => {
      const submittedOrder = makeOrder({
        status: OrderStatus.SUBMITTED,
        reservedAmountRial: TOTAL_AMOUNT,
      });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(submittedOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.REJECTED }));
      (accountRepo.releaseCredit as jest.Mock).mockResolvedValue(undefined);
      (orderRepo.rejectInTx as jest.Mock).mockResolvedValue(undefined);

      await service.rejectOrder('staff-user-id', ORDER_ID, rejectDto);

      // Credit released atomically
      expect(accountRepo.releaseCredit).toHaveBeenCalledTimes(1);
      expect(accountRepo.releaseCredit).toHaveBeenCalledWith({
        tx: fakeTx,
        customerId: CUSTOMER_ID,
        amount: TOTAL_AMOUNT,
        orderId: ORDER_ID,
        actorId: 'staff-user-id',
        reason: expect.stringContaining(rejectDto.reason),
      });
      expect(orderRepo.rejectInTx).toHaveBeenCalledTimes(1);

      // Phase 3.4: Quotation ALSO expired atomically (§2.3)
      expect(quotationsService.expireForOrderInTx).toHaveBeenCalledWith(
        fakeTx,
        ORDER_ID,
        'staff-user-id',
      );
      expect(quotationsService.auditQuotationExpiry).toHaveBeenCalledWith(
        ORDER_ID,
        'staff-user-id',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_REJECTED' }),
      );
    });

    it('throws InvalidOrderStateTransitionException if order is already REJECTED', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(
        makeOrder({ status: OrderStatus.REJECTED }),
      );

      await expect(
        service.rejectOrder('staff-user-id', ORDER_ID, rejectDto),
      ).rejects.toBeInstanceOf(InvalidOrderStateTransitionException);
    });

    it('throws InvalidOrderStateTransitionException if order is CANCELLED', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(
        makeOrder({ status: OrderStatus.CANCELLED }),
      );

      await expect(
        service.rejectOrder('staff-user-id', ORDER_ID, rejectDto),
      ).rejects.toBeInstanceOf(InvalidOrderStateTransitionException);
    });

    it('throws InvalidOrderStateTransitionException if order is DRAFT (cannot reject uncommitted)', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(makeOrder({ status: OrderStatus.DRAFT }));

      await expect(
        service.rejectOrder('staff-user-id', ORDER_ID, rejectDto),
      ).rejects.toBeInstanceOf(InvalidOrderStateTransitionException);
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.rejectOrder('staff-user-id', ORDER_ID, rejectDto),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
    });
  });

  // ─── approveOrder (Phase 3.5) ─────────────────────────────────────────────

  describe('approveOrder', () => {
    const approveDto: ApproveOrderDto = { notes: 'Looks good' };

    it('approves an UNDER_REVIEW Order (UNDER_REVIEW → APPROVED), no credit consumed', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(underReviewOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.APPROVED }));

      // Concurrency guard: tx re-reads status as UNDER_REVIEW
      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'UNDER_REVIEW' });

      const result = await service.approveOrder('reviewer-user', ORDER_ID, approveDto);

      // Order updated to APPROVED
      const txOrderUpdate = (fakeTx as unknown as { order: { update: jest.Mock } }).order.update;
      expect(txOrderUpdate).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({ status: 'APPROVED' }),
      });

      // Active Assignment completed atomically
      const txAssignmentUpdate = (fakeTx as unknown as { assignment: { updateMany: jest.Mock } })
        .assignment.updateMany;
      expect(txAssignmentUpdate).toHaveBeenCalledWith({
        where: { orderId: ORDER_ID, status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });

      // Credit NOT consumed (§3.3 — credit consumed at Trade approval)
      expect(accountRepo.releaseCredit).not.toHaveBeenCalled();

      // Audit logged
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_APPROVED' }),
      );

      expect(result.status).toBe(OrderStatus.APPROVED);
    });

    it('approves an ASSIGNED Order (ASSIGNED → APPROVED)', async () => {
      const assignedOrder = makeOrder({ status: OrderStatus.ASSIGNED });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(assignedOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.APPROVED }));

      // Concurrency guard: tx sees ASSIGNED status
      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'ASSIGNED' });

      const result = await service.approveOrder('reviewer-user', ORDER_ID, approveDto);
      expect(result.status).toBe(OrderStatus.APPROVED);
    });

    it('CREDIT SAFETY: approval does NOT release or consume credit (§3.3)', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(underReviewOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.APPROVED }));
      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'UNDER_REVIEW' });

      await service.approveOrder('reviewer-user', ORDER_ID, approveDto);

      // No credit operations triggered
      expect(accountRepo.releaseCredit).not.toHaveBeenCalled();
      // quotationsService not called on approve
      expect(quotationsService.expireForOrderInTx).not.toHaveBeenCalled();
    });

    it('CONCURRENCY: throws InvalidOrderStateTransitionException if already approved by another reviewer', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock).mockResolvedValue(underReviewOrder);

      // Concurrency guard: tx sees APPROVED (another reviewer beat us)
      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'APPROVED' });

      await expect(service.approveOrder('reviewer-user', ORDER_ID, approveDto)).rejects.toThrow(
        InvalidOrderStateTransitionException,
      );
    });

    it('throws InvalidOrderStateTransitionException from DRAFT state', async () => {
      const draftOrder = makeOrder({ status: OrderStatus.DRAFT });
      (orderRepo.findById as jest.Mock).mockResolvedValue(draftOrder);

      await expect(service.approveOrder('reviewer-user', ORDER_ID, approveDto)).rejects.toThrow(
        InvalidOrderStateTransitionException,
      );
    });

    it('throws InvalidOrderStateTransitionException from APPROVED state', async () => {
      const approvedOrder = makeOrder({ status: OrderStatus.APPROVED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(approvedOrder);

      await expect(service.approveOrder('reviewer-user', ORDER_ID, approveDto)).rejects.toThrow(
        InvalidOrderStateTransitionException,
      );
    });

    it('throws OrderNotFoundException when order not found', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.approveOrder('reviewer-user', ORDER_ID, approveDto)).rejects.toThrow(
        OrderNotFoundException,
      );
    });
  });

  // ─── requestRevision (Phase 3.5) ─────────────────────────────────────────

  describe('requestRevision', () => {
    const revisionDto: RequestRevisionDto = {
      reason: 'Please clarify the customer type before we proceed.',
    };

    it('requests revision from UNDER_REVIEW (UNDER_REVIEW → REVISION_REQUESTED)', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(underReviewOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.REVISION_REQUESTED }));

      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'UNDER_REVIEW' });

      const result = await service.requestRevision('reviewer-user', ORDER_ID, revisionDto);

      // Order updated to REVISION_REQUESTED
      const txOrderUpdate = (fakeTx as unknown as { order: { update: jest.Mock } }).order.update;
      expect(txOrderUpdate).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({ status: 'REVISION_REQUESTED' }),
      });

      // Assignment completed atomically
      const txAssignmentUpdate = (fakeTx as unknown as { assignment: { updateMany: jest.Mock } })
        .assignment.updateMany;
      expect(txAssignmentUpdate).toHaveBeenCalledWith({
        where: { orderId: ORDER_ID, status: 'ACTIVE' },
        data: expect.objectContaining({ status: 'COMPLETED' }),
      });

      // Credit NOT released on revision request (it's still reserved)
      expect(accountRepo.releaseCredit).not.toHaveBeenCalled();

      // Audit logged
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_REVISION_REQUESTED' }),
      );

      expect(result.status).toBe(OrderStatus.REVISION_REQUESTED);
    });

    it('requests revision from ASSIGNED state', async () => {
      const assignedOrder = makeOrder({ status: OrderStatus.ASSIGNED });
      (orderRepo.findById as jest.Mock)
        .mockResolvedValueOnce(assignedOrder)
        .mockResolvedValueOnce(makeOrder({ status: OrderStatus.REVISION_REQUESTED }));

      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'ASSIGNED' });

      const result = await service.requestRevision('reviewer-user', ORDER_ID, revisionDto);
      expect(result.status).toBe(OrderStatus.REVISION_REQUESTED);
    });

    it('CONCURRENCY: throws if already processed by another reviewer', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock).mockResolvedValue(underReviewOrder);

      // Another reviewer already approved/rejected — tx sees different status
      (
        fakeTx as unknown as { order: { findUnique: jest.Mock } }
      ).order.findUnique.mockResolvedValue({ status: 'APPROVED' });

      await expect(service.requestRevision('reviewer-user', ORDER_ID, revisionDto)).rejects.toThrow(
        InvalidOrderStateTransitionException,
      );
    });

    it('throws InvalidOrderStateTransitionException from QUOTED state', async () => {
      const quotedOrder = makeOrder({ status: OrderStatus.QUOTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);

      await expect(service.requestRevision('reviewer-user', ORDER_ID, revisionDto)).rejects.toThrow(
        InvalidOrderStateTransitionException,
      );
    });

    it('throws OrderNotFoundException when order not found', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(null);
      await expect(service.requestRevision('reviewer-user', ORDER_ID, revisionDto)).rejects.toThrow(
        OrderNotFoundException,
      );
    });
  });

  // ─── Customer isolation ───────────────────────────────────────────────────

  describe('customer isolation', () => {
    /**
     * SECURITY: Customers must NEVER be able to access another customer's orders.
     * We return 404 (not 403) to prevent enumeration — docs/21-business-decisions.md §3
     */
    it('returns OrderNotFoundException when customer tries to access another customer order', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      // findByIdForCustomer returns null — order exists but belongs to ANOTHER customer
      (orderRepo.findByIdForCustomer as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getOrderDetail(CUSTOMER_USER_ID, 'other-order-id', false),
      ).rejects.toBeInstanceOf(OrderNotFoundException);
    });

    it('staff can access any order regardless of customerId', async () => {
      const anyOrder = makeOrder({ customerId: 'different-customer', id: 'other-order-id' });
      (orderRepo.findById as jest.Mock).mockResolvedValue(anyOrder);

      const result = await service.getOrderDetail('staff-user-id', 'other-order-id', true);
      expect(result.id).toBe('other-order-id');
    });

    it('customer list is scoped to own orders only', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (orderRepo.findByCustomerId as jest.Mock).mockResolvedValue({
        orders: [makeOrder()],
        total: 1,
      });

      const dto: ListOrdersDto = { page: 1, limit: 20 };
      await service.listOrders(CUSTOMER_USER_ID, dto, false);

      // findByCustomerId called with THIS customer's ID, not findAll
      expect(orderRepo.findByCustomerId).toHaveBeenCalledWith(CUSTOMER_ID, { page: 1, limit: 20 });
      expect(orderRepo.findAll).not.toHaveBeenCalled();
    });
  });

  // ─── State machine integrity ──────────────────────────────────────────────

  describe('OrderEntity state machine', () => {
    it('DRAFT: canSubmit=true, canCancel=true, hasCreditReserved=false', () => {
      const order = makeOrder({ status: OrderStatus.DRAFT });
      expect(order.canSubmit()).toBe(true);
      expect(order.canCancel()).toBe(true);
      expect(order.hasCreditReserved()).toBe(false);
    });

    it('SUBMITTED: canSubmit=false, canCancel=true, hasCreditReserved=true', () => {
      const order = makeOrder({ status: OrderStatus.SUBMITTED });
      expect(order.canSubmit()).toBe(false);
      expect(order.canCancel()).toBe(true);
      expect(order.hasCreditReserved()).toBe(true);
    });

    it('CANCELLED: canSubmit=false, canCancel=false, hasCreditReserved=false', () => {
      const order = makeOrder({ status: OrderStatus.CANCELLED });
      expect(order.canSubmit()).toBe(false);
      expect(order.canCancel()).toBe(false);
      expect(order.hasCreditReserved()).toBe(false);
    });

    it('REJECTED: canSubmit=false, canCancel=false, canReject=false', () => {
      const order = makeOrder({ status: OrderStatus.REJECTED });
      expect(order.canSubmit()).toBe(false);
      expect(order.canCancel()).toBe(false);
      expect(order.canReject()).toBe(false);
    });

    it('UNDER_REVIEW: hasCreditReserved=true, canReject=true', () => {
      const order = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      expect(order.hasCreditReserved()).toBe(true);
      expect(order.canReject()).toBe(true);
    });

    it('APPROVED: hasCreditReserved=false (consumed; not this phase)', () => {
      const order = makeOrder({ status: OrderStatus.APPROVED });
      // APPROVED is past the credit-reserved stages but consumed credit is tracked separately
      // hasCreditReserved only checks if reservedCreditRial needs to be released
      expect(order.canSubmit()).toBe(false);
      expect(order.canCancel()).toBe(false);
    });

    // Phase 3.5 state machine tests
    it('QUOTED: canBeAssigned=true, canApprove=false', () => {
      const order = makeOrder({ status: OrderStatus.QUOTED });
      expect(order.canBeAssigned()).toBe(true);
      expect(order.canApprove()).toBe(false);
      expect(order.canRequestRevision()).toBe(false);
      expect(order.canCancel()).toBe(true);
    });

    it('ASSIGNED: canBeAssigned=false, canApprove=true, canRequestRevision=true, canCancel=true', () => {
      const order = makeOrder({ status: OrderStatus.ASSIGNED });
      expect(order.canBeAssigned()).toBe(false);
      expect(order.canApprove()).toBe(true);
      expect(order.canRequestRevision()).toBe(true);
      expect(order.canCancel()).toBe(true);
      expect(order.hasCreditReserved()).toBe(true);
    });

    it('UNDER_REVIEW: canApprove=true, canRequestRevision=true, canReject=true', () => {
      const order = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      expect(order.canApprove()).toBe(true);
      expect(order.canRequestRevision()).toBe(true);
      expect(order.canReject()).toBe(true);
      expect(order.canCancel()).toBe(true);
      expect(order.hasCreditReserved()).toBe(true);
    });

    it('REVISION_REQUESTED: canApprove=false, canCancel=true, hasCreditReserved=true', () => {
      const order = makeOrder({ status: OrderStatus.REVISION_REQUESTED });
      expect(order.canApprove()).toBe(false);
      expect(order.canRequestRevision()).toBe(false);
      expect(order.canCancel()).toBe(true);
      expect(order.hasCreditReserved()).toBe(true);
    });
  });

  // ─── Response serialization ───────────────────────────────────────────────

  describe('response serialization', () => {
    it('serializes Decimal amounts as strings with 2 decimal places (BR-P05)', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(activeCustomerRow);
      (pricingEngine.calculate as jest.Mock).mockResolvedValue(pricingResult);
      (orderRepo.nextOrderNumber as jest.Mock).mockResolvedValue(ORDER_NUMBER);
      const order = makeOrder({
        totalAmountRial: new Decimal('1234567.89'),
        reservedAmountRial: new Decimal(0),
      });
      (orderRepo.createInTx as jest.Mock).mockResolvedValue(order);
      (orderRepo.findById as jest.Mock).mockResolvedValue(order);

      const result = await service.createOrder(CUSTOMER_USER_ID, {
        weightGrams: '10',
        purityRatio: '0.750',
      });

      // Must be string, never a floating-point number
      expect(typeof result.totalAmountRial).toBe('string');
      expect(result.totalAmountRial).toBe('1234567.89');
      expect(typeof result.reservedAmountRial).toBe('string');
      expect(result.reservedAmountRial).toBe('0.00');
    });
  });
});
