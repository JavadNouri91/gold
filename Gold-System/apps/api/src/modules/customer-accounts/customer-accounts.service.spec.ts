import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CustomerAccountsService } from './application/customer-accounts.service';
import { CustomerAccountRepository } from './infrastructure/repositories/customer-account.repository';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/application/audit.service';
import { CustomerAccountEntity } from './domain/entities/customer-account.entity';
import { CreditPool } from './application/dto/grant-credit.dto';
import Decimal from 'decimal.js';

function makeAccount(
  overrides: Partial<ConstructorParameters<typeof CustomerAccountEntity>[0]> = {},
): CustomerAccountEntity {
  return new CustomerAccountEntity({
    id: 'acct-1',
    customerId: 'cust-1',
    status: 'ACTIVE',
    creditLimitRial: new Decimal('500000000'),
    reservedCreditRial: new Decimal('0'),
    consumedCreditRial: new Decimal('0'),
    creditLimitGoldRial: new Decimal('0'),
    reservedCreditGoldRial: new Decimal('0'),
    consumedCreditGoldRial: new Decimal('0'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const mockAccountRepo = {
  findByCustomerId: jest.fn(),
  findById: jest.fn(),
  createForCustomer: jest.fn(),
  grantCredit: jest.fn(),
  listTransactionsByAccountId: jest.fn(),
};

const mockPrisma = {
  customer: { findUnique: jest.fn() },
};

const mockAudit = {
  log: jest.fn(),
};

describe('CustomerAccountsService', () => {
  let service: CustomerAccountsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAccountsService,
        { provide: CustomerAccountRepository, useValue: mockAccountRepo },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<CustomerAccountsService>(CustomerAccountsService);
  });

  // ── findByCustomerId ─────────────────────────────────────────
  describe('findByCustomerId', () => {
    it('throws NotFoundException when account not found', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(null);
      await expect(service.findByCustomerId('cust-1')).rejects.toThrow(NotFoundException);
    });

    it('returns serialized account with Decimal amounts as strings', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());
      const result = await service.findByCustomerId('cust-1');

      // Decimal amounts serialized as strings (never Float — BR-P05)
      expect(typeof result.creditLimitRial).toBe('string');
      expect(result.creditLimitRial).toBe('500000000.00');
      expect(result.availableRial).toBe('500000000.00');
    });
  });

  // ── findByUserId ────────────────────────────────────────────
  describe('findByUserId', () => {
    it('throws NotFoundException when user has no customer profile', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.findByUserId('user-1')).rejects.toThrow(NotFoundException);
    });

    it('delegates to findByCustomerId after resolving customerId', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());

      const result = await service.findByUserId('user-1');

      expect(mockPrisma.customer.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: { id: true },
      });
      expect(result.customerId).toBe('cust-1');
    });
  });

  // ── grantCredit ─────────────────────────────────────────────
  describe('grantCredit', () => {
    it('throws BusinessRuleException when account not found', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(null);

      await expect(
        service.grantCredit(
          'cust-1',
          { pool: CreditPool.RIAL, amount: '100000000', reason: 'Initial grant' },
          'manager-1',
        ),
      ).rejects.toMatchObject({ message: expect.stringContaining('does not have an account') });
    });

    it('throws BusinessRuleException for non-numeric amount', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());

      await expect(
        service.grantCredit(
          'cust-1',
          { pool: CreditPool.RIAL, amount: 'not-a-number', reason: 'Initial grant' },
          'manager-1',
        ),
      ).rejects.toMatchObject({ message: expect.stringContaining('valid numeric') });
    });

    it('throws BusinessRuleException for zero or negative amount', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());

      await expect(
        service.grantCredit(
          'cust-1',
          { pool: CreditPool.RIAL, amount: '0', reason: 'Initial grant' },
          'manager-1',
        ),
      ).rejects.toMatchObject({ message: expect.stringContaining('greater than zero') });
    });

    it('grants credit and audits with actor + reason (BR-C04)', async () => {
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());
      mockAccountRepo.grantCredit.mockResolvedValue(
        makeAccount({ creditLimitRial: new Decimal('600000000') }),
      );

      const result = await service.grantCredit(
        'cust-1',
        { pool: CreditPool.RIAL, amount: '100000000', reason: 'Top-up credit' },
        'manager-1',
      );

      // BR-C04: audit with actor and reason
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREDIT_GRANTED',
          actorId: 'manager-1',
          reason: 'Top-up credit',
        }),
      );
      expect(result.creditLimitRial).toBe('600000000.00');
    });
  });

  // ── CustomerAccountEntity computed properties ────────────────
  describe('CustomerAccountEntity', () => {
    it('computes availableRial correctly', () => {
      const account = makeAccount({
        creditLimitRial: new Decimal('1000000000'),
        reservedCreditRial: new Decimal('200000000'),
        consumedCreditRial: new Decimal('150000000'),
      });

      // available = limit - reserved - consumed
      expect(account.availableRial.toFixed(2)).toBe('650000000.00');
    });

    it('isActive returns false for inactive status', () => {
      expect(makeAccount({ status: 'SUSPENDED' }).isActive()).toBe(false);
      expect(makeAccount({ status: 'ACTIVE' }).isActive()).toBe(true);
    });
  });

  describe('listMyTransactions', () => {
    it('returns the authenticated account ledger as decimal strings', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());
      mockAccountRepo.listTransactionsByAccountId.mockResolvedValue([
        {
          id: 'tx-1',
          type: 'RESERVATION',
          creditPool: 'RIAL',
          amount: new Decimal('1500.5'),
          balanceAfter: new Decimal('8500'),
          sourceType: 'ORDER',
          sourceId: 'order-1',
          reason: 'Credit reserved for order submission',
          createdAt: new Date('2026-09-01T10:00:00.000Z'),
        },
      ]);

      const rows = await service.listMyTransactions('user-1', 20);

      expect(mockAccountRepo.listTransactionsByAccountId).toHaveBeenCalledWith('acct-1', 20);
      expect(rows[0].amount).toBe('1500.50');
      expect(rows[0].balanceAfter).toBe('8500.00');
      expect(rows[0]).not.toHaveProperty('customerId');
    });

    it('does not read a ledger when the user has no customer profile', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.listMyTransactions('user-1', 20)).rejects.toThrow(NotFoundException);
      expect(mockAccountRepo.listTransactionsByAccountId).not.toHaveBeenCalled();
    });

    it('caps the page size at 50', async () => {
      mockPrisma.customer.findUnique.mockResolvedValue({ id: 'cust-1' });
      mockAccountRepo.findByCustomerId.mockResolvedValue(makeAccount());
      mockAccountRepo.listTransactionsByAccountId.mockResolvedValue([]);

      await service.listMyTransactions('user-1', 500);

      expect(mockAccountRepo.listTransactionsByAccountId).toHaveBeenCalledWith('acct-1', 50);
    });
  });
});
