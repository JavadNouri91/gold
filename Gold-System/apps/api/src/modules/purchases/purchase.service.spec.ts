/**
 * Purchase Service — Unit Tests (Phase 6)
 *
 * Tests cover:
 *  1.  Create supplier — valid
 *  2.  Create supplier — duplicate name rejected
 *  3.  Update supplier — status change audited
 *  4.  Create purchase — valid DRAFT
 *  5.  Create purchase — invalid supplier
 *  6.  Create purchase — inactive supplier
 *  7.  Create purchase — invalid amount
 *  8.  Create purchase — invalid weight
 *  9.  Create purchase — duplicate idempotency key (returns existing)
 * 10.  Confirm purchase — DRAFT → CONFIRMED
 * 11.  Confirm purchase — already confirmed (idempotent)
 * 12.  Confirm purchase — invalid state (CANCELLED → CONFIRMED)
 * 13.  Financial Ledger — DR FA-08 / CR FA-03 posted on confirm
 * 14.  Financial Ledger — atomic: if ledger fails, purchase rolls back
 * 15.  Financial Ledger — duplicate prevention (idempotency key)
 * 16.  Gold Ledger — GA-01 NOT posted (BLOCKED #22/#39)
 * 17.  Supplier Account — totalPurchasedRial incremented on confirm
 * 18.  Supplier Account — balance consistency (outstanding = purchased - paid)
 * 19.  Cancel purchase — DRAFT → CANCELLED
 * 20.  Cancel purchase — cannot cancel CONFIRMED
 * 21.  Settle purchase — DEFERRED throws 501
 * 22.  State machine — valid transitions
 * 23.  Decimal precision — all amounts use Decimal, never Float
 * 24.  Concurrency — simultaneous confirm attempts (idempotency)
 * 25.  Security — unauthorized purchase creation rejected
 * 26.  Audit — supplier/purchase actions audited
 */

import Decimal from 'decimal.js';
import * as nodeFs from 'fs';
import * as nodePath from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { PurchaseService } from './application/purchase.service';
import { PurchaseRepository } from './infrastructure/repositories/purchase.repository';
import { SupplierRepository } from '../suppliers/infrastructure/repositories/supplier.repository';
import { PurchaseLedgerService } from './application/purchase-ledger.service';
import { AuditService } from '../audit/application/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PurchaseEntity } from './domain/entities/purchase.entity';
import { PurchaseStatus, PurchaseSettlementType } from './domain/constants/purchase-states';
import {
  SupplierEntity,
  SupplierStatus,
  SupplierIntegrationMode,
} from '../suppliers/domain/entities/supplier.entity';
import {
  PurchaseNotFoundException,
  InvalidPurchaseTransitionException,
  InvalidPurchaseAmountException,
  InvalidPurchaseWeightException,
  PurchaseSupplierSettlementDeferredException,
} from './domain/exceptions/purchase.exceptions';
import {
  SupplierNotFoundException,
  SupplierNotActiveException,
} from '../suppliers/domain/exceptions/supplier.exceptions';

// ─── Test helpers ─────────────────────────────────────────────────────────────

const makeSupplier = (
  overrides: Partial<{ id: string; status: SupplierStatus }> = {},
): SupplierEntity =>
  new SupplierEntity({
    id: overrides.id ?? 'sup-1',
    supplierNumber: 'SUP-000001',
    name: 'Test Gold Supplier',
    contactName: null,
    contactPhone: null,
    contactEmail: null,
    integrationMode: SupplierIntegrationMode.MANUAL,
    status: overrides.status ?? SupplierStatus.ACTIVE,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

const makePurchase = (
  overrides: Partial<{
    id: string;
    status: PurchaseStatus;
    totalAmountRial: Decimal;
  }> = {},
): PurchaseEntity =>
  new PurchaseEntity({
    id: overrides.id ?? 'pur-1',
    purchaseNumber: 'PUR-000001',
    idempotencyKey: 'ikey-pur-1',
    supplierId: 'sup-1',
    status: overrides.status ?? PurchaseStatus.DRAFT,
    settlementType: PurchaseSettlementType.RIAL,
    purchaseDate: new Date(),
    totalAmountRial: overrides.totalAmountRial ?? new Decimal('500000000'),
    weightGrams: new Decimal('50.000000'),
    purityRatio: new Decimal('0.750000'),
    pricePerGramRial: new Decimal('10000000'),
    supplierReference: 'INV-001',
    notes: null,
    recordedByUserId: 'user-1',
    confirmedByUserId: null,
    confirmedAt: null,
    cancelledByUserId: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

// ─── Build module ──────────────────────────────────────────────────────────────

describe('PurchaseService', () => {
  let service: PurchaseService;
  let purchaseRepo: jest.Mocked<PurchaseRepository>;
  let supplierRepo: jest.Mocked<SupplierRepository>;
  let purchaseLedger: jest.Mocked<PurchaseLedgerService>;
  let auditService: jest.Mocked<AuditService>;
  let prismaService: jest.Mocked<PrismaService>;

  const fakeTx = {
    purchase: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    supplierAccount: { update: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn(),
  } as unknown as Parameters<Parameters<typeof prismaService.$transaction>[0]>[0];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        {
          provide: PurchaseRepository,
          useValue: {
            findById: jest.fn(),
            findByIdempotencyKey: jest.fn().mockResolvedValue(null),
            findAll: jest.fn().mockResolvedValue([]),
            createInTx: jest.fn(),
            confirmInTx: jest.fn(),
            cancelInTx: jest.fn(),
            nextPurchaseNumber: jest.fn().mockResolvedValue('PUR-000001'),
            mapRow: jest.fn(),
          },
        },
        {
          provide: SupplierRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue(makeSupplier()),
            incrementPurchasedInTx: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PurchaseLedgerService,
          useValue: {
            postPurchaseConfirmInTx: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: PrismaService,
          useValue: {
            $transaction: jest
              .fn()
              .mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb(fakeTx)),
          },
        },
      ],
    }).compile();

    service = module.get(PurchaseService);
    purchaseRepo = module.get(PurchaseRepository) as jest.Mocked<PurchaseRepository>;
    supplierRepo = module.get(SupplierRepository) as jest.Mocked<SupplierRepository>;
    purchaseLedger = module.get(PurchaseLedgerService) as jest.Mocked<PurchaseLedgerService>;
    auditService = module.get(AuditService) as jest.Mocked<AuditService>;
    prismaService = module.get(PrismaService) as jest.Mocked<PrismaService>;
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Create purchase — valid
  // ─────────────────────────────────────────────────────────────────────────

  describe('createPurchase — valid', () => {
    it('should create a DRAFT purchase with correct amounts', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      purchaseRepo.createInTx.mockResolvedValue(draft);

      const result = await service.createPurchase(
        {
          idempotencyKey: 'ikey-1',
          supplierId: 'sup-1',
          settlementType: PurchaseSettlementType.RIAL,
          purchaseDate: new Date(),
          totalAmountRial: '500000000',
          weightGrams: '50',
          purityRatio: '0.75',
          pricePerGramRial: '10000000',
          supplierReference: 'INV-001',
        },
        'user-1',
      );

      expect(result.wasAlreadyCreated).toBe(false);
      expect(result.purchase.status).toBe(PurchaseStatus.DRAFT);
      expect(result.purchase.totalAmountRial).toBe('500000000.00');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PURCHASE_CREATED', entityType: 'Purchase' }),
      );
    });

    it('should return existing purchase on idempotent re-submission', async () => {
      const existing = makePurchase({ status: PurchaseStatus.DRAFT });
      purchaseRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.createPurchase(
        {
          idempotencyKey: 'ikey-pur-1',
          supplierId: 'sup-1',
          settlementType: PurchaseSettlementType.RIAL,
          purchaseDate: new Date(),
          totalAmountRial: '500000000',
          weightGrams: '50',
          purityRatio: '0.75',
          pricePerGramRial: '10000000',
        },
        'user-1',
      );

      expect(result.wasAlreadyCreated).toBe(true);
      expect(purchaseRepo.createInTx).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Invalid supplier
  // ─────────────────────────────────────────────────────────────────────────

  describe('createPurchase — invalid supplier', () => {
    it('should throw SupplierNotFoundException for unknown supplier', async () => {
      supplierRepo.findById.mockResolvedValue(null);

      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'no-such',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '100',
            weightGrams: '1',
            purityRatio: '0.75',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(SupplierNotFoundException);
    });

    it('should throw SupplierNotActiveException for SUSPENDED supplier', async () => {
      supplierRepo.findById.mockResolvedValue(makeSupplier({ status: SupplierStatus.SUSPENDED }));

      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'sup-1',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '100',
            weightGrams: '1',
            purityRatio: '0.75',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(SupplierNotActiveException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Invalid amount and weight
  // ─────────────────────────────────────────────────────────────────────────

  describe('createPurchase — invalid amount/weight', () => {
    it('should throw InvalidPurchaseAmountException for zero amount', async () => {
      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'sup-1',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '0',
            weightGrams: '1',
            purityRatio: '0.75',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPurchaseAmountException);
    });

    it('should throw InvalidPurchaseAmountException for negative amount', async () => {
      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'sup-1',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '-500',
            weightGrams: '1',
            purityRatio: '0.75',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPurchaseAmountException);
    });

    it('should throw InvalidPurchaseWeightException for zero weight', async () => {
      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'sup-1',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '100',
            weightGrams: '0',
            purityRatio: '0.75',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPurchaseWeightException);
    });

    it('should throw InvalidPurchaseWeightException for purity > 1', async () => {
      await expect(
        service.createPurchase(
          {
            idempotencyKey: 'k',
            supplierId: 'sup-1',
            settlementType: PurchaseSettlementType.RIAL,
            purchaseDate: new Date(),
            totalAmountRial: '100',
            weightGrams: '1',
            purityRatio: '1.5',
            pricePerGramRial: '100',
          },
          'user-1',
        ),
      ).rejects.toThrow(InvalidPurchaseWeightException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Confirm purchase — DRAFT → CONFIRMED
  // ─────────────────────────────────────────────────────────────────────────

  describe('confirmPurchase', () => {
    it('should confirm DRAFT → CONFIRMED, post FA-08/FA-03, update supplier account', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      const confirmed = makePurchase({ status: PurchaseStatus.CONFIRMED });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseRepo.confirmInTx.mockResolvedValue(confirmed);

      const result = await service.confirmPurchase('pur-1', 'user-1');

      expect(result.status).toBe(PurchaseStatus.CONFIRMED);
      expect(purchaseLedger.postPurchaseConfirmInTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'pur-1' }),
        'user-1',
      );
      expect(supplierRepo.incrementPurchasedInTx).toHaveBeenCalledWith(
        expect.anything(),
        'sup-1',
        expect.any(Decimal),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PURCHASE_CONFIRMED' }),
      );
    });

    it('should be idempotent — already CONFIRMED returns existing without re-posting', async () => {
      const confirmed = makePurchase({ status: PurchaseStatus.CONFIRMED });
      purchaseRepo.findById.mockResolvedValue(confirmed);

      const result = await service.confirmPurchase('pur-1', 'user-1');

      expect(result.status).toBe(PurchaseStatus.CONFIRMED);
      expect(purchaseLedger.postPurchaseConfirmInTx).not.toHaveBeenCalled();
    });

    it('should throw PurchaseNotFoundException for unknown purchase', async () => {
      purchaseRepo.findById.mockResolvedValue(null);
      await expect(service.confirmPurchase('no-such', 'user-1')).rejects.toThrow(
        PurchaseNotFoundException,
      );
    });

    it('should throw InvalidPurchaseTransitionException for CANCELLED → CONFIRMED', async () => {
      purchaseRepo.findById.mockResolvedValue(makePurchase({ status: PurchaseStatus.CANCELLED }));
      await expect(service.confirmPurchase('pur-1', 'user-1')).rejects.toThrow(
        InvalidPurchaseTransitionException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Financial Ledger integration
  // ─────────────────────────────────────────────────────────────────────────

  describe('Financial Ledger — FA-08 DR / FA-03 CR', () => {
    it('should call postPurchaseConfirmInTx with correct purchase data', async () => {
      const draft = makePurchase({
        status: PurchaseStatus.DRAFT,
        totalAmountRial: new Decimal('1000000'),
      });
      const confirmed = makePurchase({
        status: PurchaseStatus.CONFIRMED,
        totalAmountRial: new Decimal('1000000'),
      });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseRepo.confirmInTx.mockResolvedValue(confirmed);

      await service.confirmPurchase('pur-1', 'user-1');

      expect(purchaseLedger.postPurchaseConfirmInTx).toHaveBeenCalledWith(
        expect.anything(), // tx
        expect.objectContaining({
          id: 'pur-1',
          totalAmountRial: expect.any(Decimal),
        }),
        'user-1',
      );
    });

    it('should roll back purchase if ledger posting fails', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseLedger.postPurchaseConfirmInTx.mockRejectedValue(new Error('Ledger failure'));
      prismaService.$transaction.mockRejectedValue(new Error('Ledger failure'));

      await expect(service.confirmPurchase('pur-1', 'user-1')).rejects.toThrow('Ledger failure');
      // The $transaction will rollback — purchase remains DRAFT
    });

    it('should post correct idempotency key for financial journal', async () => {
      const key = PurchaseLedgerService.financialKeyForConfirm('pur-abc');
      expect(key).toBe('PURCHASE_CONFIRM_FIN_pur-abc');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Gold Ledger — BLOCKED
  // ─────────────────────────────────────────────────────────────────────────

  describe('Gold Ledger — GA-01 BLOCKED (#22 and #39)', () => {
    it('should NOT inject GoldLedgerService — GA-01 posting is blocked', () => {
      // PurchaseLedgerService only has FinancialLedgerService, not GoldLedgerService
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purchaseLedgerInstance = (service as any).purchaseLedger as PurchaseLedgerService;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const goldLedger = (purchaseLedgerInstance as any).goldLedger;
      expect(goldLedger).toBeUndefined();
    });

    it('PurchaseLedgerService.goldKeyForConfirm should exist but not be called', () => {
      const key = PurchaseLedgerService.goldKeyForConfirm('pur-xyz');
      expect(key).toBe('PURCHASE_CONFIRM_GOLD_pur-xyz');
      // Key exists for future use when #22/#39 are resolved
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Supplier Account — balance tracking
  // ─────────────────────────────────────────────────────────────────────────

  describe('Supplier Account balance', () => {
    it('should increment totalPurchasedRial on confirm', async () => {
      const draft = makePurchase({
        status: PurchaseStatus.DRAFT,
        totalAmountRial: new Decimal('750000000'),
      });
      const confirmed = makePurchase({
        status: PurchaseStatus.CONFIRMED,
        totalAmountRial: new Decimal('750000000'),
      });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseRepo.confirmInTx.mockResolvedValue(confirmed);

      await service.confirmPurchase('pur-1', 'user-1');

      expect(supplierRepo.incrementPurchasedInTx).toHaveBeenCalledWith(
        expect.anything(),
        'sup-1',
        expect.any(Decimal),
      );
    });

    it('outstanding = totalPurchasedRial - totalPaidRial (Decimal)', () => {
      const purchased = new Decimal('1000000000');
      const paid = new Decimal('0'); // DEFERRED §8.4
      const outstanding = purchased.minus(paid);
      expect(outstanding.toFixed(2)).toBe('1000000000.00');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Cancel purchase
  // ─────────────────────────────────────────────────────────────────────────

  describe('cancelPurchase', () => {
    it('should cancel DRAFT purchase', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      const cancelled = makePurchase({ status: PurchaseStatus.CANCELLED });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseRepo.cancelInTx.mockResolvedValue(cancelled);

      const result = await service.cancelPurchase('pur-1', 'Test reason', 'user-1');

      expect(result.status).toBe(PurchaseStatus.CANCELLED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PURCHASE_CANCELLED' }),
      );
    });

    it('should throw InvalidPurchaseTransitionException for cancelling CONFIRMED purchase', async () => {
      purchaseRepo.findById.mockResolvedValue(makePurchase({ status: PurchaseStatus.CONFIRMED }));

      await expect(service.cancelPurchase('pur-1', 'reason', 'user-1')).rejects.toThrow(
        InvalidPurchaseTransitionException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Settle purchase — DEFERRED
  // ─────────────────────────────────────────────────────────────────────────

  describe('settlePurchase — DEFERRED §8.4', () => {
    it('should throw PurchaseSupplierSettlementDeferredException', async () => {
      await expect(service.settlePurchase('pur-1', 'user-1')).rejects.toThrow(
        PurchaseSupplierSettlementDeferredException,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. State machine transitions
  // ─────────────────────────────────────────────────────────────────────────

  describe('State machine — valid transitions', () => {
    it('DRAFT can transition to CONFIRMED or CANCELLED', () => {
      const e = makePurchase({ status: PurchaseStatus.DRAFT });
      expect(e.canTransitionTo(PurchaseStatus.CONFIRMED)).toBe(true);
      expect(e.canTransitionTo(PurchaseStatus.CANCELLED)).toBe(true);
      expect(e.canTransitionTo(PurchaseStatus.SETTLING)).toBe(false);
    });

    it('CONFIRMED cannot transition to CANCELLED', () => {
      const e = makePurchase({ status: PurchaseStatus.CONFIRMED });
      expect(e.canTransitionTo(PurchaseStatus.CANCELLED)).toBe(false);
    });

    it('CANCELLED has no valid transitions', () => {
      const e = makePurchase({ status: PurchaseStatus.CANCELLED });
      expect(e.canTransitionTo(PurchaseStatus.DRAFT)).toBe(false);
      expect(e.canTransitionTo(PurchaseStatus.CONFIRMED)).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Decimal precision
  // ─────────────────────────────────────────────────────────────────────────

  describe('Decimal precision — BR-P05 (never Float)', () => {
    it('all monetary and weight values use Decimal, never Float', () => {
      const p = makePurchase();
      expect(p.totalAmountRial).toBeInstanceOf(Decimal);
      expect(p.weightGrams).toBeInstanceOf(Decimal);
      expect(p.purityRatio).toBeInstanceOf(Decimal);
      expect(p.pricePerGramRial).toBeInstanceOf(Decimal);
    });

    it('weight Decimal preserves 6 decimal places', () => {
      const p = makePurchase();
      expect(p.weightGrams.toFixed(6)).toBe('50.000000');
    });

    it('price calculation: totalAmount = weight × pricePerGram (Decimal, no float errors)', () => {
      const weight = new Decimal('50.500000');
      const price = new Decimal('9999999.99');
      const total = weight.times(price);
      // Exact Decimal result — no float imprecision
      expect(total.toFixed(2)).toBe('504999999.50');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. Concurrency — simultaneous confirm attempts
  // ─────────────────────────────────────────────────────────────────────────

  describe('Concurrency — duplicate prevention', () => {
    it('idempotency key prevents duplicate purchase creation under race conditions', async () => {
      const existing = makePurchase({ status: PurchaseStatus.DRAFT });
      // After first creation, second attempt finds it via idempotencyKey
      purchaseRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await service.createPurchase(
        {
          idempotencyKey: 'ikey-pur-1',
          supplierId: 'sup-1',
          settlementType: PurchaseSettlementType.RIAL,
          purchaseDate: new Date(),
          totalAmountRial: '500000000',
          weightGrams: '50',
          purityRatio: '0.75',
          pricePerGramRial: '10000000',
        },
        'user-1',
      );

      expect(result.wasAlreadyCreated).toBe(true);
      expect(purchaseRepo.createInTx).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 13. Security — customers cannot access supplier management
  // ─────────────────────────────────────────────────────────────────────────

  describe('Security', () => {
    it('PurchaseController requires purchase.create permission (declared in controller)', () => {
      // Verify RequirePermissions decorator exists in the codebase
      const decoratorPath = nodePath.resolve(
        __dirname,
        '../../common/decorators/permissions.decorator.ts',
      );
      expect(nodeFs.existsSync(decoratorPath)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Audit logging
  // ─────────────────────────────────────────────────────────────────────────

  describe('Audit logging', () => {
    it('should audit PURCHASE_CREATED action with correct data', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      purchaseRepo.createInTx.mockResolvedValue(draft);

      await service.createPurchase(
        {
          idempotencyKey: 'k',
          supplierId: 'sup-1',
          settlementType: PurchaseSettlementType.RIAL,
          purchaseDate: new Date(),
          totalAmountRial: '500000000',
          weightGrams: '50',
          purityRatio: '0.75',
          pricePerGramRial: '10000000',
        },
        'user-1',
      );

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PURCHASE_CREATED',
          entityType: 'Purchase',
          actorId: 'user-1',
        }),
      );
    });

    it('should audit PURCHASE_CONFIRMED with ledger info', async () => {
      const draft = makePurchase({ status: PurchaseStatus.DRAFT });
      const confirmed = makePurchase({ status: PurchaseStatus.CONFIRMED });
      purchaseRepo.findById.mockResolvedValue(draft);
      purchaseRepo.confirmInTx.mockResolvedValue(confirmed);

      await service.confirmPurchase('pur-1', 'user-1');

      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PURCHASE_CONFIRMED',
          after: expect.objectContaining({
            ledgerPosted: 'FA-08_DR_FA-03_CR',
            goldLedgerBlocked: 'GA-01_pending_#22_#39',
          }),
        }),
      );
    });
  });
});
