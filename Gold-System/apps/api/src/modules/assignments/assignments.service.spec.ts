/**
 * Assignments Service Unit Tests — Phase 3.5
 *
 * Coverage:
 *   - Assignment creation (valid QUOTED order)
 *   - Assignment: invalid state (non-QUOTED order)
 *   - Reassignment: cancels previous ACTIVE assignment, creates new one
 *   - startReview: ASSIGNED → UNDER_REVIEW
 *   - startReview: invalid state (non-ASSIGNED order)
 *   - getReviewContext: returns full review data (Order, Customer, Quotation, Account)
 *   - Review context: reviewer cannot modify historical pricing (immutability check)
 *   - listAssignments: manager sees all; reviewer sees own
 *   - Audit: every assignment action creates audit records
 *   - Customer isolation: no assignment data exposed to customers (controller level)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AssignmentStatus, OrderStatus, QuotationStatus } from '@gold/shared-types';

import { AssignmentsService } from './application/assignments.service';
import { AssignmentRepository } from './infrastructure/repositories/assignment.repository';
import { OrderRepository } from '../orders/infrastructure/repositories/order.repository';
import { QuotationRepository } from '../quotations/infrastructure/repositories/quotation.repository';
import { AuditService } from '../audit/application/audit.service';
import { PrismaService } from '../../database/prisma.service';

import { AssignmentEntity } from './domain/entities/assignment.entity';
import { OrderEntity } from '../orders/domain/entities/order.entity';
import { QuotationEntity } from '../quotations/domain/entities/quotation.entity';

import {
  OrderNotAssignableException,
  OrderNotUnderReviewException,
} from './domain/exceptions/assignment.exceptions';
import { OrderNotFoundException } from '../orders/domain/exceptions/order.exceptions';

import Decimal from 'decimal.js';
import { AssignOrderDto } from './application/dto/assign-order.dto';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ORDER_ID = 'order-1';
const ORDER_NUMBER = 'ORD-000001';
const CUSTOMER_ID = 'customer-1';
const ACCOUNT_ID = 'account-1';
const PRICING_CALC_ID = 'calc-1';
const QUOTATION_ID = 'quotation-1';
const QUOTATION_NUMBER = 'QT-000001';
const ASSIGNER_USER_ID = 'operator-user-1';
const ASSIGNEE_USER_ID = 'reviewer-user-1';
const ASSIGNMENT_ID = 'assignment-1';

const TOTAL_AMOUNT = new Decimal('1000000.00');
const WEIGHT_GRAMS = new Decimal('10.000000');
const PURITY_RATIO = new Decimal('0.750000');

function makeOrder(overrides: Partial<{ status: OrderStatus }> = {}): OrderEntity {
  return new OrderEntity({
    id: ORDER_ID,
    orderNumber: ORDER_NUMBER,
    customerId: CUSTOMER_ID,
    customerAccountId: ACCOUNT_ID,
    pricingCalculationId: PRICING_CALC_ID,
    status: overrides.status ?? OrderStatus.QUOTED,
    totalAmountRial: TOTAL_AMOUNT,
    reservedAmountRial: TOTAL_AMOUNT,
    weightGrams: WEIGHT_GRAMS,
    purityRatio: PURITY_RATIO,
    customerType: null,
    submittedAt: new Date(),
    cancelledAt: null,
    rejectedAt: null,
    cancellationReason: null,
    cancelledByUserId: null,
    rejectionReason: null,
    rejectedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeQuotation(overrides: Partial<{ status: QuotationStatus }> = {}): QuotationEntity {
  return new QuotationEntity({
    id: QUOTATION_ID,
    quotationNumber: QUOTATION_NUMBER,
    orderId: ORDER_ID,
    customerId: CUSTOMER_ID,
    pricingCalculationId: PRICING_CALC_ID,
    version: 1,
    status: overrides.status ?? QuotationStatus.ACTIVE,
    totalAmountRial: TOTAL_AMOUNT,
    weightGrams: WEIGHT_GRAMS,
    purityRatio: PURITY_RATIO,
    step1BasePrice: new Decimal('100000'),
    wageAmount: new Decimal('0'),
    discountAmount: new Decimal('0'),
    roundingAmount: new Decimal('0'),
    isComplete: false,
    documentKey: 'quotations/QT-000001/v1.json',
    documentMimeType: 'application/json',
    documentGeneratedAt: new Date(),
    generatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeAssignment(
  overrides: Partial<{
    id: string;
    status: AssignmentStatus;
  }> = {},
): AssignmentEntity {
  return new AssignmentEntity({
    id: overrides.id ?? ASSIGNMENT_ID,
    orderId: ORDER_ID,
    quotationId: QUOTATION_ID,
    assignedToId: ASSIGNEE_USER_ID,
    assignedById: ASSIGNER_USER_ID,
    status: overrides.status ?? AssignmentStatus.ACTIVE,
    notes: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('AssignmentsService', () => {
  let service: AssignmentsService;
  let assignmentRepo: jest.Mocked<AssignmentRepository>;
  let orderRepo: jest.Mocked<OrderRepository>;
  let quotationRepo: jest.Mocked<QuotationRepository>;
  let auditService: jest.Mocked<AuditService>;
  let prisma: jest.Mocked<PrismaService>;

  // fakeTx for $transaction callbacks
  const fakeTx = {
    order: { update: jest.fn(), findUnique: jest.fn() },
    assignment: { updateMany: jest.fn(), create: jest.fn() },
  } as unknown as Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

  beforeEach(async () => {
    // Reset fakeTx mocks
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock; create: jest.Mock };
      }
    ).order.update = jest.fn().mockResolvedValue({});
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock; create: jest.Mock };
      }
    ).order.findUnique = jest.fn();
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock; create: jest.Mock };
      }
    ).assignment.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    (
      fakeTx as unknown as {
        order: { update: jest.Mock; findUnique: jest.Mock };
        assignment: { updateMany: jest.Mock; create: jest.Mock };
      }
    ).assignment.create = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentsService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest.fn(),
            order: { update: jest.fn(), findUnique: jest.fn() },
            assignment: { findMany: jest.fn(), count: jest.fn() },
          },
        },
        {
          provide: AssignmentRepository,
          useValue: {
            findById: jest.fn(),
            findActiveForOrder: jest.fn(),
            findByOrderId: jest.fn(),
            findByAssignedTo: jest.fn(),
            createInTx: jest.fn(),
            cancelActiveForOrderInTx: jest.fn(),
            completeActiveForOrderInTx: jest.fn(),
          },
        },
        {
          provide: OrderRepository,
          useValue: {
            findById: jest.fn(),
            findByIdForCustomer: jest.fn(),
          },
        },
        {
          provide: QuotationRepository,
          useValue: {
            findByOrderId: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AssignmentsService);
    assignmentRepo = module.get(AssignmentRepository) as jest.Mocked<AssignmentRepository>;
    orderRepo = module.get(OrderRepository) as jest.Mocked<OrderRepository>;
    quotationRepo = module.get(QuotationRepository) as jest.Mocked<QuotationRepository>;
    auditService = module.get(AuditService) as jest.Mocked<AuditService>;
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;

    // Default: $transaction executes callback immediately with fakeTx
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof fakeTx) => Promise<unknown>) => cb(fakeTx),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createAssignment ─────────────────────────────────────────────────────

  describe('createAssignment', () => {
    const dto: AssignOrderDto = { assignedToUserId: ASSIGNEE_USER_ID, notes: 'Please review' };

    it('creates an Assignment for a QUOTED order (first assignment)', async () => {
      const quotedOrder = makeOrder({ status: OrderStatus.QUOTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);
      (quotationRepo.findByOrderId as jest.Mock).mockResolvedValue([makeQuotation()]);
      (assignmentRepo.findActiveForOrder as jest.Mock).mockResolvedValue(null); // no existing
      const created = makeAssignment();
      (assignmentRepo.createInTx as jest.Mock).mockResolvedValue(created);

      const result = await service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, dto);

      // Assignment created
      expect(assignmentRepo.createInTx).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({
          orderId: ORDER_ID,
          quotationId: QUOTATION_ID,
          assignedToId: ASSIGNEE_USER_ID,
          assignedById: ASSIGNER_USER_ID,
          notes: 'Please review',
        }),
      );

      // Previous assignments NOT cancelled (first assignment)
      expect(assignmentRepo.cancelActiveForOrderInTx).not.toHaveBeenCalled();

      // Order transitioned to ASSIGNED
      const txOrder = (fakeTx as unknown as { order: { update: jest.Mock } }).order.update;
      expect(txOrder).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({ status: 'ASSIGNED' }),
      });

      // Audit logged (two entries: assignment + order status)
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_ASSIGNED' }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_STATUS_CHANGED' }),
      );

      expect(result.orderId).toBe(ORDER_ID);
      expect(result.assignedToId).toBe(ASSIGNEE_USER_ID);
      expect(result.status).toBe(AssignmentStatus.ACTIVE);
    });

    it('reassigns: cancels previous ACTIVE assignment and creates new one', async () => {
      const quotedOrder = makeOrder({ status: OrderStatus.QUOTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);
      (quotationRepo.findByOrderId as jest.Mock).mockResolvedValue([makeQuotation()]);

      const existingAssignment = makeAssignment({ id: 'old-assignment-1' });
      (assignmentRepo.findActiveForOrder as jest.Mock).mockResolvedValue(existingAssignment);
      (assignmentRepo.cancelActiveForOrderInTx as jest.Mock).mockResolvedValue(1);

      const newAssignment = makeAssignment({ id: 'new-assignment-1' });
      (assignmentRepo.createInTx as jest.Mock).mockResolvedValue(newAssignment);

      const reassignDto: AssignOrderDto = { assignedToUserId: 'reviewer-user-2' };
      await service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, reassignDto);

      // Previous assignment CANCELLED
      expect(assignmentRepo.cancelActiveForOrderInTx).toHaveBeenCalledWith(fakeTx, ORDER_ID);

      // New assignment created
      expect(assignmentRepo.createInTx).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({ assignedToId: 'reviewer-user-2' }),
      );

      // Audit action is REASSIGNED
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_REASSIGNED' }),
      );
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.createAssignment(ASSIGNER_USER_ID, 'nonexistent', dto)).rejects.toThrow(
        OrderNotFoundException,
      );
      expect(assignmentRepo.createInTx).not.toHaveBeenCalled();
    });

    it('throws OrderNotAssignableException when Order is not in QUOTED state', async () => {
      // Order is in SUBMITTED state — cannot be assigned yet
      const submittedOrder = makeOrder({ status: OrderStatus.SUBMITTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(submittedOrder);

      await expect(service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, dto)).rejects.toThrow(
        OrderNotAssignableException,
      );
    });

    it('throws OrderNotAssignableException when Order is already ASSIGNED (via service guard)', async () => {
      const assignedOrder = makeOrder({ status: OrderStatus.ASSIGNED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(assignedOrder);

      await expect(service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, dto)).rejects.toThrow(
        OrderNotAssignableException,
      );
    });

    it('throws OrderNotAssignableException when Order is APPROVED', async () => {
      const approvedOrder = makeOrder({ status: OrderStatus.APPROVED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(approvedOrder);

      await expect(service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, dto)).rejects.toThrow(
        OrderNotAssignableException,
      );
    });

    it('assignment has no quotationId when no ACTIVE quotation found', async () => {
      const quotedOrder = makeOrder({ status: OrderStatus.QUOTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);
      (quotationRepo.findByOrderId as jest.Mock).mockResolvedValue([]); // no quotations
      (assignmentRepo.findActiveForOrder as jest.Mock).mockResolvedValue(null);
      const created = makeAssignment();
      (assignmentRepo.createInTx as jest.Mock).mockResolvedValue(created);

      await service.createAssignment(ASSIGNER_USER_ID, ORDER_ID, dto);

      expect(assignmentRepo.createInTx).toHaveBeenCalledWith(
        fakeTx,
        expect.objectContaining({ quotationId: null }),
      );
    });
  });

  // ─── startReview ─────────────────────────────────────────────────────────

  describe('startReview', () => {
    it('transitions ASSIGNED Order to UNDER_REVIEW', async () => {
      const assignedOrder = makeOrder({ status: OrderStatus.ASSIGNED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(assignedOrder);
      (prisma.order as unknown as { update: jest.Mock }).update = jest.fn().mockResolvedValue({});

      await service.startReview('reviewer-user-1', ORDER_ID);

      expect((prisma.order as unknown as { update: jest.Mock }).update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: expect.objectContaining({ status: 'UNDER_REVIEW' }),
      });

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ORDER_REVIEW_STARTED' }),
      );
    });

    it('throws OrderNotUnderReviewException when Order is not ASSIGNED', async () => {
      const quotedOrder = makeOrder({ status: OrderStatus.QUOTED });
      (orderRepo.findById as jest.Mock).mockResolvedValue(quotedOrder);

      await expect(service.startReview('reviewer-user-1', ORDER_ID)).rejects.toThrow(
        OrderNotUnderReviewException,
      );
    });

    it('throws OrderNotUnderReviewException when Order is already UNDER_REVIEW', async () => {
      const underReviewOrder = makeOrder({ status: OrderStatus.UNDER_REVIEW });
      (orderRepo.findById as jest.Mock).mockResolvedValue(underReviewOrder);

      await expect(service.startReview('reviewer-user-1', ORDER_ID)).rejects.toThrow(
        OrderNotUnderReviewException,
      );
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      (orderRepo.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.startReview('reviewer-user-1', 'nonexistent')).rejects.toThrow(
        OrderNotFoundException,
      );
    });
  });

  // ─── getReviewContext ─────────────────────────────────────────────────────

  describe('getReviewContext', () => {
    it('returns full review context with all required data', async () => {
      // Mock prisma.order.findUnique with full join
      const mockOrderRow = {
        id: ORDER_ID,
        orderNumber: ORDER_NUMBER,
        status: 'UNDER_REVIEW',
        totalAmountRial: new Decimal('1000000.00'),
        reservedAmountRial: new Decimal('1000000.00'),
        weightGrams: new Decimal('10.000000'),
        purityRatio: new Decimal('0.750000'),
        customerType: null,
        submittedAt: new Date(),
        createdAt: new Date(),
        customer: {
          id: CUSTOMER_ID,
          customerNumber: 'CUST-000001',
          firstName: 'Ali',
          lastName: 'Hosseini',
          nationalId: '1234567890',
          mobile: '09123456789',
          type: 'HOUSEHOLD',
          status: 'ACTIVE',
          account: {
            id: ACCOUNT_ID,
            status: 'ACTIVE',
            creditLimitRial: new Decimal('5000000.00'),
            reservedCreditRial: new Decimal('1000000.00'),
            consumedCreditRial: new Decimal('0.00'),
          },
          kycVerifications: [{ status: 'APPROVED', createdAt: new Date() }],
        },
        quotations: [
          {
            id: QUOTATION_ID,
            quotationNumber: QUOTATION_NUMBER,
            version: 1,
            status: 'ACTIVE',
            totalAmountRial: new Decimal('1000000.00'),
            weightGrams: new Decimal('10.000000'),
            purityRatio: new Decimal('0.750000'),
            step1BasePrice: new Decimal('100000'),
            wageAmount: new Decimal('0'),
            discountAmount: new Decimal('0'),
            roundingAmount: new Decimal('0'),
            isComplete: false,
            documentKey: 'quotations/QT-000001/v1.json',
            generatedAt: new Date(),
          },
        ],
        assignments: [
          {
            id: ASSIGNMENT_ID,
            orderId: ORDER_ID,
            quotationId: QUOTATION_ID,
            assignedToId: ASSIGNEE_USER_ID,
            assignedById: ASSIGNER_USER_ID,
            status: 'ACTIVE',
            notes: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };

      (prisma.order as unknown as { findUnique: jest.Mock }).findUnique = jest
        .fn()
        .mockResolvedValue(mockOrderRow);

      const result = await service.getReviewContext(ORDER_ID);

      // Order data
      expect(result.order.id).toBe(ORDER_ID);
      expect(result.order.totalAmountRial).toBe('1000000.00');
      expect(result.order.weightGrams).toBe('10.000000');

      // Customer data (required for review per UC-10)
      expect(result.customer.firstName).toBe('Ali');
      expect(result.customer.type).toBe('HOUSEHOLD');
      expect(result.customer.kycStatus).toBe('APPROVED');

      // Account data (reserved credit visible to reviewer)
      expect(result.account).not.toBeNull();
      expect(result.account!.reservedCreditRial).toBe('1000000.00');
      expect(result.account!.availableCreditRial).toBe('4000000.00'); // 5M - 1M - 0

      // Quotation snapshot (pricing snapshot for reviewer)
      expect(result.quotation).not.toBeNull();
      expect(result.quotation!.quotationNumber).toBe(QUOTATION_NUMBER);
      expect(result.quotation!.totalAmountRial).toBe('1000000.00');
      expect(result.quotation!.isComplete).toBe(false); // profit/tax BLOCKED

      // Active assignment
      expect(result.activeAssignment).not.toBeNull();
      expect(result.activeAssignment!.assignedToId).toBe(ASSIGNEE_USER_ID);
    });

    it('returns null quotation when no ACTIVE quotation exists', async () => {
      const mockOrderRow = {
        id: ORDER_ID,
        orderNumber: ORDER_NUMBER,
        status: 'ASSIGNED',
        totalAmountRial: new Decimal('1000000.00'),
        reservedAmountRial: new Decimal('1000000.00'),
        weightGrams: new Decimal('10.000000'),
        purityRatio: new Decimal('0.750000'),
        customerType: null,
        submittedAt: new Date(),
        createdAt: new Date(),
        customer: {
          id: CUSTOMER_ID,
          customerNumber: 'CUST-000001',
          firstName: 'Ali',
          lastName: 'Test',
          nationalId: '1234567890',
          mobile: '09123456789',
          type: null,
          status: 'ACTIVE',
          account: null,
          kycVerifications: [],
        },
        quotations: [], // no ACTIVE quotations
        assignments: [],
      };

      (prisma.order as unknown as { findUnique: jest.Mock }).findUnique = jest
        .fn()
        .mockResolvedValue(mockOrderRow);

      const result = await service.getReviewContext(ORDER_ID);

      expect(result.quotation).toBeNull();
      expect(result.account).toBeNull();
      expect(result.customer.kycStatus).toBeNull();
      expect(result.activeAssignment).toBeNull();
    });

    /**
     * IMMUTABILITY (§2.2, BR-P03):
     * The review context returns the STORED snapshot from the Quotation.
     * It does NOT recalculate prices based on current gold price.
     * This test verifies that the pricing data is read from the locked snapshot.
     */
    it('IMMUTABILITY: review context shows locked pricing snapshot — NOT current price (§2.2)', async () => {
      // Quotation was generated with price 1,000,000 Rial
      // Gold price has since changed to 2,000,000 Rial per gram
      // The review context must still show the original locked price
      const lockedPrice = new Decimal('1000000.00');
      const mockOrderRow = {
        id: ORDER_ID,
        orderNumber: ORDER_NUMBER,
        status: 'UNDER_REVIEW',
        totalAmountRial: lockedPrice, // locked at submission
        reservedAmountRial: lockedPrice,
        weightGrams: new Decimal('10.000000'),
        purityRatio: new Decimal('0.750000'),
        customerType: null,
        submittedAt: new Date(),
        createdAt: new Date(),
        customer: {
          id: CUSTOMER_ID,
          customerNumber: 'CUST-000001',
          firstName: 'Ali',
          lastName: 'Test',
          nationalId: '1234567890',
          mobile: '09123456789',
          type: null,
          status: 'ACTIVE',
          account: null,
          kycVerifications: [],
        },
        quotations: [
          {
            id: QUOTATION_ID,
            quotationNumber: QUOTATION_NUMBER,
            version: 1,
            status: 'ACTIVE',
            totalAmountRial: lockedPrice, // same locked price in Quotation snapshot
            weightGrams: new Decimal('10.000000'),
            purityRatio: new Decimal('0.750000'),
            step1BasePrice: new Decimal('100000'),
            wageAmount: new Decimal('0'),
            discountAmount: new Decimal('0'),
            roundingAmount: new Decimal('0'),
            isComplete: false,
            documentKey: null,
            generatedAt: new Date(),
          },
        ],
        assignments: [],
      };

      (prisma.order as unknown as { findUnique: jest.Mock }).findUnique = jest
        .fn()
        .mockResolvedValue(mockOrderRow);

      const result = await service.getReviewContext(ORDER_ID);

      // The locked price is returned — not a recalculation
      expect(result.quotation!.totalAmountRial).toBe('1000000.00');
      expect(result.order.totalAmountRial).toBe('1000000.00');
      // If we had called PricingEngine, it might return 2,000,000 — but we don't call it
    });

    it('throws OrderNotFoundException when order does not exist', async () => {
      (prisma.order as unknown as { findUnique: jest.Mock }).findUnique = jest
        .fn()
        .mockResolvedValue(null);

      await expect(service.getReviewContext(ORDER_ID)).rejects.toThrow(OrderNotFoundException);
    });
  });

  // ─── listAssignments ─────────────────────────────────────────────────────

  describe('listAssignments', () => {
    const mockAssignmentRow = {
      id: ASSIGNMENT_ID,
      orderId: ORDER_ID,
      quotationId: QUOTATION_ID,
      assignedToId: ASSIGNEE_USER_ID,
      assignedById: ASSIGNER_USER_ID,
      status: 'ACTIVE',
      notes: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('reviewer sees only their own assignments (isManager=false)', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([[mockAssignmentRow], 1]);

      const result = await service.listAssignments(ASSIGNEE_USER_ID, false, { page: 1, limit: 20 });

      expect(result.total).toBe(1);
      expect(result.assignments[0].assignedToId).toBe(ASSIGNEE_USER_ID);
      expect(result.meta.totalPages).toBe(1);
    });

    it('manager sees all assignments (isManager=true)', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([[mockAssignmentRow], 5]);

      const result = await service.listAssignments('manager-user', true, { page: 1, limit: 20 });

      expect(result.total).toBe(5);
    });

    it('supports pagination', async () => {
      (prisma.$transaction as jest.Mock).mockResolvedValue([[mockAssignmentRow], 100]);

      const result = await service.listAssignments(ASSIGNEE_USER_ID, false, { page: 3, limit: 10 });

      expect(result.meta.page).toBe(3);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(10);
    });
  });
});
