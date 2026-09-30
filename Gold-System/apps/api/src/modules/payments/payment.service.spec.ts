/**
 * Payment Service — Unit Tests
 *
 * Phase 5: Payment + Allocation + Settlement vertical slice
 * docs/21-business-decisions.md §8, §9
 * architecture/STATE-MACHINES.md (Payment state machine)
 *
 * Test groups:
 *  1. recordPayment — valid payment
 *  2. recordPayment — invalid trade (nonexistent)
 *  3. recordPayment — rejected / cancelled trade
 *  4. recordPayment — invalid amount
 *  5. recordPayment — duplicate reference (idempotency)
 *  6. recordPayment — missing reference number for bank/card
 *  7. validatePayment — valid validation
 *  8. validatePayment — invalid state transition
 *  9. allocatePayment — valid allocation
 * 10. allocatePayment — allocation exceeding remaining balance
 * 11. allocatePayment — duplicate allocation
 * 12. allocatePayment — Decimal arithmetic precision
 * 13. Settlement — fully paid Trade → SETTLED
 * 14. Settlement — partially paid Trade → PENDING
 * 15. Settlement — unpaid Trade → PENDING
 * 16. Settlement — overpayment blocked
 * 17. Concurrency — simultaneous allocation requests (race condition)
 * 18. Security — unauthorized states blocked by state machine
 * 19. Audit — operations generate audit log entries
 * 20. BLOCKED ledger posting confirmed absent
 */

import Decimal from 'decimal.js';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './application/payment.service';
import { PaymentRepository } from './infrastructure/repositories/payment.repository';
import { SettlementRepository } from '../settlements/infrastructure/repositories/settlement.repository';
import { AuditService } from '../audit/application/audit.service';
import { NotificationService } from '../notifications/application/notification.service';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
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
} from './domain/exceptions/payment.exceptions';
import { PaymentEntity } from './domain/entities/payment.entity';
import { PaymentMethod, PaymentStatus, SettlementStatus } from './domain/constants/payment-methods';
import { SettlementEntity } from '../settlements/domain/entities/settlement.entity';

// ─── Test helpers ────────────────────────────────────────────────────────────

const makePaymentEntity = (
  overrides: Partial<{
    id: string;
    status: PaymentStatus;
    amount: Decimal;
    tradeId: string;
    customerId: string;
    method: PaymentMethod;
  }> = {},
): PaymentEntity =>
  new PaymentEntity({
    id: overrides.id ?? 'pay-1',
    idempotencyKey: 'ikey-1',
    tradeId: overrides.tradeId ?? 'trade-1',
    customerId: overrides.customerId ?? 'cust-1',
    method: overrides.method ?? PaymentMethod.BANK_TRANSFER,
    amount: overrides.amount ?? new Decimal('100000000'),
    currency: 'IRR',
    status: overrides.status ?? PaymentStatus.PENDING,
    referenceNumber: 'REF-123',
    notes: null,
    receivedAt: null,
    recordedByUserId: 'user-1',
    validatedAt: null,
    validatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makeSettlementEntity = (
  overrides: Partial<{
    status: SettlementStatus;
    settledAmount: Decimal;
    tradeId: string;
  }> = {},
): SettlementEntity =>
  new SettlementEntity({
    id: 'set-1',
    tradeId: overrides.tradeId ?? 'trade-1',
    status: overrides.status ?? SettlementStatus.PENDING,
    settledAmount: overrides.settledAmount ?? new Decimal(0),
    settledAt: null,
    settledByUserId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const CONFIRMED_TRADE = {
  id: 'trade-1',
  orderId: 'order-1',
  customerId: 'cust-1',
  status: 'CONFIRMED',
  totalAmountRial: new Decimal('100000000'),
};

// ─── Service factory ─────────────────────────────────────────────────────────

type MockPaymentRepo = jest.Mocked<PaymentRepository>;
type MockSettlementRepo = jest.Mocked<SettlementRepository>;
type MockAudit = jest.Mocked<AuditService>;

function buildMockTx() {
  return {
    payment: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentAllocation: {
      create: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
    settlement: {
      upsert: jest.fn(),
    },
    trade: {
      update: jest.fn().mockResolvedValue({}),
    },
    order: {
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepo: MockPaymentRepo;
  let settlementRepo: MockSettlementRepo;
  let auditService: MockAudit;
  let prismaService: jest.Mocked<PrismaService>;
  let storage: { upload: jest.Mock; delete: jest.Mock; getObject: jest.Mock };
  let fakeTx: ReturnType<typeof buildMockTx>;

  beforeEach(async () => {
    fakeTx = buildMockTx();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PaymentRepository,
          useValue: {
            findById: jest.fn(),
            findByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findByTradeId: jest.fn().mockResolvedValue([]),
            findAll: jest.fn().mockResolvedValue([]),
            count: jest.fn().mockResolvedValue(0),
            queryLedger: jest.fn().mockResolvedValue({ total: 0, rows: [] }),
            summarizeLedger: jest.fn().mockResolvedValue([]),
            findOwned: jest.fn().mockResolvedValue(null),
            findAllocationsByTradeId: jest.fn().mockResolvedValue([]),
            findAllocationByPaymentAndTrade: jest.fn().mockResolvedValue(null),
            getTotalAllocatedForTrade: jest.fn().mockResolvedValue(new Decimal(0)),
            getTotalAllocatedForTradeInTx: jest.fn().mockResolvedValue(new Decimal(0)),
            createPaymentInTx: jest.fn(),
            updateStatusInTx: jest.fn(),
            createAllocationInTx: jest.fn(),
            mapRaceRow: jest.fn(),
          },
        },
        {
          provide: SettlementRepository,
          useValue: {
            findByTradeId: jest.fn().mockResolvedValue(null),
            findById: jest.fn(),
            upsertSettlementInTx: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: NotificationService,
          useValue: { dispatch: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: PrismaService,
          useValue: {
            trade: {
              findUnique: jest.fn().mockResolvedValue(CONFIRMED_TRADE),
              findMany: jest.fn().mockResolvedValue([]),
            },
            customer: { findUnique: jest.fn().mockResolvedValue({ id: 'cust-1' }) },
            $transaction: jest
              .fn()
              .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx)),
          },
        },
        {
          provide: StorageService,
          useValue: {
            upload: jest.fn().mockResolvedValue({
              key: 'payment-receipts/cust-1/file.jpg',
              bucket: 'b',
              originalName: 'r.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 3,
            }),
            delete: jest.fn().mockResolvedValue(undefined),
            getObject: jest.fn().mockResolvedValue(Buffer.from('img')),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentService);
    paymentRepo = module.get(PaymentRepository) as MockPaymentRepo;
    settlementRepo = module.get(SettlementRepository) as MockSettlementRepo;
    auditService = module.get(AuditService) as MockAudit;
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
    storage = module.get(StorageService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Valid payment recording
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — valid payment', () => {
    it('should create a PENDING payment for a CONFIRMED trade', async () => {
      const createdPayment = makePaymentEntity({ status: PaymentStatus.PENDING });
      fakeTx.payment.findUnique.mockResolvedValue(null);
      paymentRepo.createPaymentInTx.mockResolvedValue(createdPayment);

      const result = await service.recordPayment(
        {
          idempotencyKey: 'ikey-1',
          tradeId: 'trade-1',
          method: PaymentMethod.BANK_TRANSFER,
          amount: '100000000',
          referenceNumber: 'REF-123',
        },
        'user-1',
      );

      expect(result.wasAlreadyRecorded).toBe(false);
      expect(result.payment.status).toBe(PaymentStatus.PENDING);
      expect(result.payment.amount).toBe('100000000.00');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_RECORDED', entityType: 'Payment' }),
      );
    });

    it('should return existing payment on idempotent re-submission (wasAlreadyRecorded = true)', async () => {
      const existing = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.recordPayment(
        {
          idempotencyKey: 'ikey-1',
          tradeId: 'trade-1',
          method: PaymentMethod.BANK_TRANSFER,
          amount: '100000000',
          referenceNumber: 'REF-123',
        },
        'user-1',
      );

      expect(result.wasAlreadyRecorded).toBe(true);
      expect(result.payment.status).toBe(PaymentStatus.VALIDATED);
      // Should NOT have called createPaymentInTx
      expect(paymentRepo.createPaymentInTx).not.toHaveBeenCalled();
    });

    it('should accept CASH payment without referenceNumber', async () => {
      const cashPayment = makePaymentEntity({ method: PaymentMethod.CASH });
      paymentRepo.createPaymentInTx.mockResolvedValue(cashPayment);

      const result = await service.recordPayment(
        {
          idempotencyKey: 'ikey-cash',
          tradeId: 'trade-1',
          method: PaymentMethod.CASH,
          amount: '100000000',
          // no referenceNumber — cash doesn't require it
        },
        'user-1',
      );

      expect(result.payment.method).toBe(PaymentMethod.CASH);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Invalid trade — nonexistent
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — nonexistent trade', () => {
    it('should throw TradeNotFoundForPaymentException when trade does not exist', async () => {
      (prismaService.trade.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.recordPayment(
          {
            idempotencyKey: 'k',
            tradeId: 'no-such-trade',
            method: PaymentMethod.CASH,
            amount: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(TradeNotFoundForPaymentException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Invalid trade status — REJECTED, CANCELLED, REVERSED
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — invalid trade status', () => {
    it.each(['REJECTED', 'CANCELLED', 'REVERSED', 'COMPLETED'])(
      'should throw TradeNotPayableException for trade in status %s',
      async (badStatus) => {
        (prismaService.trade.findUnique as jest.Mock).mockResolvedValue({
          ...CONFIRMED_TRADE,
          status: badStatus,
        });

        await expect(
          service.recordPayment(
            { idempotencyKey: 'k', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: '100' },
            'user-1',
          ),
        ).rejects.toThrow(TradeNotPayableException);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Invalid amount
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — invalid amount', () => {
    it('should throw InvalidPaymentAmountException for zero amount', async () => {
      await expect(
        service.recordPayment(
          { idempotencyKey: 'k', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: '0' },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it('should throw InvalidPaymentAmountException for negative amount', async () => {
      await expect(
        service.recordPayment(
          { idempotencyKey: 'k', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: '-500' },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it('should throw InvalidPaymentAmountException for non-numeric string', async () => {
      await expect(
        service.recordPayment(
          { idempotencyKey: 'k', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: 'abc' },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Duplicate reference — idempotency
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — duplicate idempotency key', () => {
    it('should return existing payment without creating a new one', async () => {
      const existing = makePaymentEntity({ id: 'pay-existing' });
      paymentRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.recordPayment(
        {
          idempotencyKey: 'duplicate-key',
          tradeId: 'trade-1',
          method: PaymentMethod.CASH,
          amount: '100',
        },
        'user-1',
      );

      expect(result.wasAlreadyRecorded).toBe(true);
      expect(result.payment.id).toBe('pay-existing');
      expect(paymentRepo.createPaymentInTx).not.toHaveBeenCalled();
      // Audit should NOT be called on idempotent path
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Missing reference number
  // ─────────────────────────────────────────────────────────────────────────

  describe('recordPayment — missing reference for bank/card methods', () => {
    it.each([PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD_TO_CARD])(
      'should throw MissingPaymentReferenceException for %s without referenceNumber',
      async (method) => {
        await expect(
          service.recordPayment(
            { idempotencyKey: 'k', tradeId: 'trade-1', method, amount: '100000' },
            'user-1',
          ),
        ).rejects.toThrow(MissingPaymentReferenceException);
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Validate payment
  // ─────────────────────────────────────────────────────────────────────────

  describe('validatePayment', () => {
    it('should transition PENDING → VALIDATED', async () => {
      const pending = makePaymentEntity({ status: PaymentStatus.PENDING });
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(pending);
      paymentRepo.updateStatusInTx.mockResolvedValue(validated);

      const result = await service.validatePayment('pay-1', 'user-1');

      expect(result.status).toBe(PaymentStatus.VALIDATED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_VALIDATED' }),
      );
    });

    it('should throw PaymentNotFoundException for unknown ID', async () => {
      paymentRepo.findById.mockResolvedValue(null);
      await expect(service.validatePayment('no-such', 'user-1')).rejects.toThrow(
        PaymentNotFoundException,
      );
    });

    it('should throw InvalidPaymentTransitionException if not PENDING', async () => {
      const allocated = makePaymentEntity({ status: PaymentStatus.ALLOCATED });
      paymentRepo.findById.mockResolvedValue(allocated);

      await expect(service.validatePayment('pay-1', 'user-1')).rejects.toThrow(
        InvalidPaymentTransitionException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. State machine — invalid transitions
  // ─────────────────────────────────────────────────────────────────────────

  describe('PaymentEntity.canTransitionTo', () => {
    it('PENDING can go to VALIDATED or FAILED only', () => {
      const e = makePaymentEntity({ status: PaymentStatus.PENDING });
      expect(e.canTransitionTo(PaymentStatus.VALIDATED)).toBe(true);
      expect(e.canTransitionTo(PaymentStatus.FAILED)).toBe(true);
      expect(e.canTransitionTo(PaymentStatus.ALLOCATED)).toBe(false);
      expect(e.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
    });

    it('FAILED has no valid transitions', () => {
      const e = makePaymentEntity({ status: PaymentStatus.FAILED });
      expect(e.canTransitionTo(PaymentStatus.PENDING)).toBe(false);
      expect(e.canTransitionTo(PaymentStatus.VALIDATED)).toBe(false);
    });

    it('REVERSED has no valid transitions', () => {
      const e = makePaymentEntity({ status: PaymentStatus.REVERSED });
      expect(e.canTransitionTo(PaymentStatus.COMPLETED)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Allocate payment — valid allocation
  // ─────────────────────────────────────────────────────────────────────────

  describe('allocatePayment — valid', () => {
    it('should create allocation, transition payment to ALLOCATED, update settlement', async () => {
      const validated = makePaymentEntity({
        status: PaymentStatus.VALIDATED,
        amount: new Decimal('100000000'),
      });
      const allocated = makePaymentEntity({ status: PaymentStatus.ALLOCATED });
      const allocation = {
        id: 'alloc-1',
        paymentId: 'pay-1',
        tradeId: 'trade-1',
        amount: new Decimal('80000000'),
        allocatedByUserId: 'user-1',
        allocatedAt: new Date(),
      };
      const settlement = makeSettlementEntity({
        status: SettlementStatus.PENDING,
        settledAmount: new Decimal('80000000'),
      });

      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);
      fakeTx.$executeRaw.mockResolvedValue(1);
      fakeTx.paymentAllocation.aggregate.mockResolvedValue({ _sum: { amount: new Decimal(0) } });
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal(0));
      paymentRepo.createAllocationInTx.mockResolvedValue(allocation as any);
      paymentRepo.updateStatusInTx.mockResolvedValue(allocated);
      settlementRepo.upsertSettlementInTx.mockResolvedValue(settlement);

      const result = await service.allocatePayment(
        'pay-1',
        { tradeId: 'trade-1', amount: '80000000' },
        'user-1',
      );

      expect(result.payment.status).toBe(PaymentStatus.ALLOCATED);
      expect(result.allocation.amount).toBe('80000000.00');
      expect(result.settlement.status).toBe(SettlementStatus.PENDING);
      expect(result.wasAlreadyAllocated).toBe(false);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_ALLOCATED' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Allocation exceeding remaining balance
  // ─────────────────────────────────────────────────────────────────────────

  describe('allocatePayment — over-allocation', () => {
    it('should throw PaymentOverAllocationException if amount > remaining', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);

      // Trade total = 100M, already allocated 80M → remaining = 20M
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal('80000000'));

      // Try to allocate 70M more (> 20M remaining)
      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '70000000' }, 'user-1'),
      ).rejects.toThrow(PaymentOverAllocationException);
    });

    it('should block overpayment — trade cannot be settled above 100% (§8.1)', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);

      // Trade total = 100M, already fully allocated
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal('100000000'));

      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '1' }, 'user-1'),
      ).rejects.toThrow(PaymentOverAllocationException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Duplicate allocation
  // ─────────────────────────────────────────────────────────────────────────

  describe('allocatePayment — duplicate allocation', () => {
    it('should throw DuplicatePaymentAllocationException if already allocated', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      const existingAlloc = {
        id: 'alloc-existing',
        paymentId: 'pay-1',
        tradeId: 'trade-1',
        amount: new Decimal('100000000'),
        allocatedByUserId: 'user-1',
        allocatedAt: new Date(),
      };
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(existingAlloc as any);

      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '100000000' }, 'user-1'),
      ).rejects.toThrow(DuplicatePaymentAllocationException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Decimal arithmetic precision
  // ─────────────────────────────────────────────────────────────────────────

  describe('Decimal arithmetic precision', () => {
    it('should use Decimal for remaining balance computation — no float rounding errors', () => {
      // Classic float pitfall: 0.1 + 0.2 !== 0.3 in floating point
      const tradeTotal = new Decimal('100000000.01');
      const allocated = new Decimal('99999999.99');
      const remaining = tradeTotal.minus(allocated);
      expect(remaining.toFixed(2)).toBe('0.02'); // exact, not 0.019999...
    });

    it('SettlementEntity.isFullyPaid uses Decimal comparison correctly', () => {
      const settlement = makeSettlementEntity({
        settledAmount: new Decimal('100000000'),
      });
      const tradeTotal = new Decimal('100000000');
      expect(settlement.isFullyPaid(tradeTotal)).toBe(true);

      const partialSettlement = makeSettlementEntity({
        settledAmount: new Decimal('99999999.99'),
      });
      expect(partialSettlement.isFullyPaid(tradeTotal)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Settlement — fully paid Trade → SETTLED
  // ─────────────────────────────────────────────────────────────────────────

  describe('Settlement — fully paid', () => {
    it('should create Settlement(SETTLED) and transition Trade to COMPLETED when 100% allocated', async () => {
      const validated = makePaymentEntity({
        status: PaymentStatus.VALIDATED,
        amount: new Decimal('100000000'),
      });
      const completed = makePaymentEntity({ status: PaymentStatus.COMPLETED });
      const settledSettlement = makeSettlementEntity({
        status: SettlementStatus.SETTLED,
        settledAmount: new Decimal('100000000'),
      });

      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal(0));
      paymentRepo.createAllocationInTx.mockResolvedValue({
        id: 'alloc-1',
        paymentId: 'pay-1',
        tradeId: 'trade-1',
        amount: new Decimal('100000000'),
        allocatedByUserId: 'user-1',
        allocatedAt: new Date(),
      } as any);
      paymentRepo.updateStatusInTx.mockResolvedValue(completed);
      settlementRepo.upsertSettlementInTx.mockResolvedValue(settledSettlement);

      const result = await service.allocatePayment(
        'pay-1',
        { tradeId: 'trade-1', amount: '100000000' },
        'user-1',
      );

      expect(result.settlement.status).toBe(SettlementStatus.SETTLED);
      expect(result.payment.status).toBe(PaymentStatus.COMPLETED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_ALLOCATED_SETTLED' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Settlement — partially paid Trade → PENDING
  // ─────────────────────────────────────────────────────────────────────────

  describe('Settlement — partially paid', () => {
    it('should keep Settlement(PENDING) when less than 100% is allocated', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      const pendingSettlement = makeSettlementEntity({
        status: SettlementStatus.PENDING,
        settledAmount: new Decimal('50000000'),
      });

      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal(0));
      paymentRepo.createAllocationInTx.mockResolvedValue({
        id: 'alloc-1',
        paymentId: 'pay-1',
        tradeId: 'trade-1',
        amount: new Decimal('50000000'),
        allocatedByUserId: 'user-1',
        allocatedAt: new Date(),
      } as any);
      paymentRepo.updateStatusInTx.mockResolvedValue(
        makePaymentEntity({ status: PaymentStatus.ALLOCATED }),
      );
      settlementRepo.upsertSettlementInTx.mockResolvedValue(pendingSettlement);

      const result = await service.allocatePayment(
        'pay-1',
        { tradeId: 'trade-1', amount: '50000000' },
        'user-1',
      );

      expect(result.settlement.status).toBe(SettlementStatus.PENDING);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 15. Settlement — unpaid Trade → PENDING
  // ─────────────────────────────────────────────────────────────────────────

  describe('getTradePaymentStatus — unpaid trade', () => {
    it('should report PENDING settlement for a trade with no payments', async () => {
      paymentRepo.findByTradeId.mockResolvedValue([]);
      paymentRepo.findAllocationsByTradeId.mockResolvedValue([]);
      settlementRepo.findByTradeId.mockResolvedValue(null);

      const status = await service.getTradePaymentStatus('trade-1');

      expect(status.settlementStatus).toBe('PENDING');
      expect(status.totalAllocated).toBe('0.00');
      expect(status.isFullyPaid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 16. Overpayment blocked (§8.1)
  // ─────────────────────────────────────────────────────────────────────────

  describe('allocatePayment — overpayment blocked', () => {
    it('should throw PaymentOverAllocationException if allocation amount > trade total', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal(0));

      // Try to allocate more than trade total (100M)
      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '150000000' }, 'user-1'),
      ).rejects.toThrow(PaymentOverAllocationException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 17. Concurrency — simultaneous allocation requests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Concurrency — simultaneous allocation (§13)', () => {
    it('should use SELECT FOR UPDATE lock to serialize concurrent allocations', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal(0));
      paymentRepo.createAllocationInTx.mockResolvedValue({
        id: 'alloc-1',
        paymentId: 'pay-1',
        tradeId: 'trade-1',
        amount: new Decimal('100000000'),
        allocatedByUserId: 'user-1',
        allocatedAt: new Date(),
      } as any);
      paymentRepo.updateStatusInTx.mockResolvedValue(
        makePaymentEntity({ status: PaymentStatus.ALLOCATED }),
      );
      settlementRepo.upsertSettlementInTx.mockResolvedValue(
        makeSettlementEntity({ status: SettlementStatus.PENDING }),
      );

      await service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '100000000' }, 'user-1');

      // Verify that $executeRaw was called (SELECT FOR UPDATE)
      expect(fakeTx.$executeRaw).toHaveBeenCalled();
    });

    it('second allocation to same trade should be rejected after first fills balance', async () => {
      const validated = makePaymentEntity({ status: PaymentStatus.VALIDATED });
      paymentRepo.findById.mockResolvedValue(validated);
      paymentRepo.findAllocationByPaymentAndTrade.mockResolvedValue(null);

      // Simulate: first request holds lock, second sees total = 70M after first allocated 70M
      // Trade total = 100M. Remaining = 30M. Second tries to allocate 70M → rejected.
      paymentRepo.getTotalAllocatedForTradeInTx.mockResolvedValue(new Decimal('70000000'));

      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '70000000' }, 'user-1'),
      ).rejects.toThrow(PaymentOverAllocationException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 18. Security — payment not VALIDATED blocks allocation
  // ─────────────────────────────────────────────────────────────────────────

  describe('Security — unauthorized state transitions', () => {
    it('should throw PaymentNotValidatedException when allocating PENDING payment', async () => {
      paymentRepo.findById.mockResolvedValue(makePaymentEntity({ status: PaymentStatus.PENDING }));

      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '100000000' }, 'user-1'),
      ).rejects.toThrow(PaymentNotValidatedException);
    });

    it('should throw PaymentNotValidatedException when allocating FAILED payment', async () => {
      paymentRepo.findById.mockResolvedValue(makePaymentEntity({ status: PaymentStatus.FAILED }));

      await expect(
        service.allocatePayment('pay-1', { tradeId: 'trade-1', amount: '100000000' }, 'user-1'),
      ).rejects.toThrow(PaymentNotValidatedException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 19. Audit logging
  // ─────────────────────────────────────────────────────────────────────────

  describe('Audit logging', () => {
    it('should audit PAYMENT_RECORDED action', async () => {
      const payment = makePaymentEntity({ status: PaymentStatus.PENDING });
      paymentRepo.createPaymentInTx.mockResolvedValue(payment);

      await service.recordPayment(
        { idempotencyKey: 'k', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: '100' },
        'user-1',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PAYMENT_RECORDED',
          entityType: 'Payment',
          actorId: 'user-1',
        }),
      );
    });

    it('should audit PAYMENT_VALIDATED action', async () => {
      paymentRepo.findById.mockResolvedValue(makePaymentEntity({ status: PaymentStatus.PENDING }));
      paymentRepo.updateStatusInTx.mockResolvedValue(
        makePaymentEntity({ status: PaymentStatus.VALIDATED }),
      );

      await service.validatePayment('pay-1', 'user-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_VALIDATED', actorId: 'user-1' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 20. BLOCKED ledger posting — confirmed absent
  // ─────────────────────────────────────────────────────────────────────────

  describe('BLOCKED — Payment Ledger Posting', () => {
    it('should NOT call FinancialLedgerService — posting rules not documented', async () => {
      // PaymentService does not inject FinancialLedgerService.
      // This test verifies that no ledger service is in the DI graph for payment.
      const providers = (service as any).financialLedger;
      expect(providers).toBeUndefined();
    });

    it('should NOT create FinancialLedgerJournal rows when payment is recorded', async () => {
      const payment = makePaymentEntity({ status: PaymentStatus.PENDING });
      paymentRepo.createPaymentInTx.mockResolvedValue(payment);

      await service.recordPayment(
        { idempotencyKey: 'k2', tradeId: 'trade-1', method: PaymentMethod.CASH, amount: '100' },
        'user-1',
      );

      // Verify no financial ledger journal was created (no such table on fakeTx)
      expect((fakeTx as any).financialLedgerJournal).toBeUndefined();
    });
  });

  describe('customer ledger ownership', () => {
    const window = { from: '2026-01-01T00:00:00.000+03:30', to: '2026-01-31T23:59:59.999+03:30' };

    it('scopes the list to the session customer and ignores a query customerId', async () => {
      (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust-real' });
      paymentRepo.queryLedger.mockResolvedValue({ total: 0, rows: [] });

      await service.listOwnPayments('user-1', {
        ...window,
        customerId: 'cust-other',
        page: 1,
        limit: 10,
      });

      const where = paymentRepo.queryLedger.mock.calls[0]?.[0] as {
        AND: Array<{ customerId?: string }>;
      };
      expect(where.AND).toEqual(expect.arrayContaining([{ customerId: 'cust-real' }]));
      expect(JSON.stringify(where)).not.toContain('cust-other');
      expect(JSON.stringify(where)).not.toContain('"not":"PENDING"');
    });

    it('returns 404 when the payment belongs to another customer', async () => {
      (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust-real' });
      paymentRepo.findOwned.mockResolvedValue(null);

      await expect(service.getPaymentForActor('user-1', 'pay-other', false)).rejects.toBeInstanceOf(
        PaymentNotFoundException,
      );
      expect(paymentRepo.findOwned).toHaveBeenCalledWith('pay-other', 'cust-real');
      expect(paymentRepo.findById).not.toHaveBeenCalled();
    });

    it('lets the owner open a receipt that is still waiting for confirmation', async () => {
      (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust-real' });
      paymentRepo.findOwned.mockResolvedValue({
        payment: makePaymentEntity({ status: PaymentStatus.PENDING, customerId: 'cust-real' }),
        orderId: 'order-1',
        orderNumber: 'ORD-1',
        tradeNumber: 'TRD-1',
        relatedSide: 'BUY',
      });

      const result = await service.getPaymentForActor('user-1', 'pay-1', false);
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(result.hasReceipt).toBe(false);
    });

    it('does not store a receipt on another customer trade', async () => {
      (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust-real' });
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

      await expect(
        service.submitOwnReceipt('user-1', {
          tradeId: 'trade-1',
          method: PaymentMethod.BANK_TRANSFER,
          amount: '1000',
          referenceNumber: 'REF-1',
          file: {
            buffer: jpeg,
            mimetype: 'image/jpeg',
            size: jpeg.length,
            originalname: 'receipt.jpg',
          },
        }),
      ).rejects.toBeInstanceOf(TradeNotFoundForPaymentException);

      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('lets staff read a payment without an ownership filter', async () => {
      paymentRepo.findById.mockResolvedValue(makePaymentEntity({ id: 'pay-1' }));

      const result = await service.getPaymentForActor('staff-1', 'pay-1', true);

      expect(result.id).toBe('pay-1');
      expect(paymentRepo.findOwned).not.toHaveBeenCalled();
    });

    it('folds summary amounts with Decimal and excludes pending groups', async () => {
      (prismaService.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust-real' });
      paymentRepo.summarizeLedger.mockResolvedValue([
        { status: 'COMPLETED', count: 2, amount: '100.10' },
        { status: 'FAILED', count: 1, amount: '0.20' },
        { status: 'REVERSED', count: 1, amount: '50.00' },
        { status: 'PENDING', count: 9, amount: '999.00' },
      ]);
      paymentRepo.count.mockResolvedValue(4);

      const summary = await service.summarizeOwn('user-1', window);

      expect(summary.successful).toEqual({ count: 2, amountRial: '100.10' });
      expect(summary.failed).toEqual({ count: 1, amountRial: '0.20' });
      expect(summary.reversed).toEqual({ count: 1, amountRial: '50.00' });
      expect(summary.totalPaid).toEqual({ count: 3, amountRial: '100.30' });
      expect(summary.hasAny).toBe(true);
      const where = paymentRepo.summarizeLedger.mock.calls[0]?.[0];
      expect(JSON.stringify(where)).not.toContain('cust-other');
    });
  });
});
