import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from '../application/reports.service';
import { ReportsRepository } from '../infrastructure/repositories/reports.repository';
import Decimal from 'decimal.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDecimal(v: number) {
  return { toString: () => String(v) } as unknown as Decimal;
}

// ─── Mock Repository ─────────────────────────────────────────────────────────

const MOCK_TRADE = {
  id: 'trade-1',
  tradeNumber: 'TRD-000001',
  status: 'CONFIRMED',
  totalAmountRial: makeDecimal(5_000_000),
  weightGrams: makeDecimal(2.5),
  confirmedAt: new Date('2026-01-15T10:00:00Z'),
  createdAt: new Date('2026-01-15T09:00:00Z'),
};

const MOCK_PAYMENT = {
  id: 'pmt-1',
  tradeId: 'trade-1',
  method: 'BANK_TRANSFER',
  amount: makeDecimal(5_000_000),
  status: 'VALIDATED',
  createdAt: new Date('2026-01-16T10:00:00Z'),
};

const dashboardStats = {
  totalCustomers: 42,
  customersByType: [
    { type: 'VIP', _count: { id: 5 } },
    { type: 'HOUSEHOLD', _count: { id: 37 } },
  ],
  pendingKyc: 3,
  activeCustomers: 38,
  suspendedCustomers: 2,
  ordersByStatus: [
    { status: 'DRAFT', _count: { id: 5 } },
    { status: 'SUBMITTED', _count: { id: 3 } },
    { status: 'CONFIRMED', _count: { id: 10 } },
    { status: 'REJECTED', _count: { id: 2 } },
    { status: 'CANCELLED', _count: { id: 1 } },
  ],
  tradesByStatus: [
    { status: 'CONFIRMED', _count: { id: 20 } },
    { status: 'SETTLED', _count: { id: 8 } },
    { status: 'REVERSED', _count: { id: 1 } },
  ],
  tradeAgg: { _sum: { totalAmountRial: makeDecimal(100_000_000), weightGrams: makeDecimal(50) } },
  paymentAgg: { _sum: { amount: makeDecimal(80_000_000) } },
  paymentCount: 25,
  settledTrades: 8,
  unsettledTrades: 21,
  recentTrades: [MOCK_TRADE],
  recentPayments: [MOCK_PAYMENT],
  totalSuppliers: 5,
  activeSuppliers: 4,
  purchasesByStatus: [
    { status: 'DRAFT', _count: { id: 1 } },
    { status: 'CONFIRMED', _count: { id: 12 } },
  ],
  purchaseAgg: { _sum: { totalAmountRial: makeDecimal(60_000_000) } },
};

const mockRepo = {
  getDashboardStats: jest.fn().mockResolvedValue(dashboardStats),
  getFinancialAccountBalance: jest.fn().mockResolvedValue({
    totalDebit: new Decimal(1_000_000),
    totalCredit: new Decimal(2_000_000),
  }),
  getGoldAccountBalance: jest.fn().mockResolvedValue({
    totalIn: new Decimal(100),
    totalOut: new Decimal(40),
  }),
  getCustomerReport: jest.fn(),
  getOrderReport: jest.fn(),
  getTradeReport: jest.fn(),
  getPaymentReport: jest.fn(),
  getSettlementReport: jest.fn(),
  getFinancialReport: jest.fn(),
  getGoldReport: jest.fn(),
  getSupplierReport: jest.fn(),
  getPurchaseReport: jest.fn(),
  getPricingReport: jest.fn(),
  getAuditReport: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: ReportsRepository, useValue: mockRepo }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns aggregated stats from all source tables', async () => {
      const result = await service.getDashboard();

      expect(result.totalCustomers).toBe(42);
      expect(result.pendingKyc).toBe(3);
      expect(result.activeCustomers).toBe(38);
    });

    it('maps customersByType correctly', async () => {
      const result = await service.getDashboard();
      expect(result.customersByType['VIP']).toBe(5);
      expect(result.customersByType['HOUSEHOLD']).toBe(37);
    });

    it('derives trade counts from byStatus', async () => {
      const result = await service.getDashboard();
      expect(result.confirmedTrades).toBe(20);
      expect(result.completedTrades).toBe(8);
      expect(result.reversedTrades).toBe(1);
    });

    it('uses Decimal for trade value totals — never Float', async () => {
      const result = await service.getDashboard();
      // Must be formatted as decimal string (2dp)
      expect(result.totalTradeValueRial).toBe('100000000.00');
      expect(result.totalTradeWeightGrams).toBe('50.000000');
    });

    it('uses Decimal for payment totals — never Float', async () => {
      const result = await service.getDashboard();
      expect(result.totalPaymentsValueRial).toBe('80000000.00');
      expect(result.totalPaymentsRecorded).toBe(25);
    });

    it('derives financial account balances from ledger — not trades', async () => {
      const result = await service.getDashboard();
      // FA-03 is liability: credit - debit = 2_000_000 - 1_000_000 = 1_000_000
      expect(result.supplierPayableRial).toBe('1000000.00');
    });

    it('derives gold position from ledger — not orders', async () => {
      const result = await service.getDashboard();
      // GA-01: totalIn 100 - totalOut 40 = 60 grams
      expect(result.goldPositionGrams).toBe('60.000000');
    });

    it('includes 10 most recent trades', async () => {
      const result = await service.getDashboard();
      expect(result.recentTrades).toHaveLength(1);
      expect(result.recentTrades[0].tradeNumber).toBe('TRD-000001');
    });

    it('formats recentTrade dates as ISO strings', async () => {
      const result = await service.getDashboard();
      expect(result.recentTrades[0].confirmedAt).toBe('2026-01-15T10:00:00.000Z');
    });

    it('handles null FA balance gracefully', async () => {
      mockRepo.getFinancialAccountBalance.mockResolvedValueOnce({
        totalDebit: new Decimal(0),
        totalCredit: new Decimal(0),
      });
      const result = await service.getDashboard();
      expect(result.supplierPayableRial).toBe('0.00');
    });
  });

  // ─── Customer Report ────────────────────────────────────────────────────────

  describe('getCustomerReport', () => {
    beforeEach(() => {
      mockRepo.getCustomerReport.mockResolvedValue({
        total: 2,
        byType: [
          { type: 'VIP', _count: { id: 1 } },
          { type: 'HOUSEHOLD', _count: { id: 1 } },
        ],
        byStatus: [{ status: 'ACTIVE', _count: { id: 2 } }],
        pendingKyc: 0,
        customers: [
          {
            id: 'c-1',
            customerNumber: 'CUST-000001',
            firstName: 'Ali',
            lastName: 'Tehrani',
            mobile: '09121234567',
            type: 'VIP',
            status: 'ACTIVE',
            kycVerifications: [{ status: 'APPROVED' }],
            account: {
              creditLimitRial: makeDecimal(10_000_000),
              consumedCreditRial: makeDecimal(2_000_000),
              reservedCreditRial: makeDecimal(1_000_000),
            },
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ],
      });
    });

    it('returns customer list with credit fields', async () => {
      const result = await service.getCustomerReport({});
      expect(result.total).toBe(2);
      expect(result.customers[0].availableCreditRial).toBe('7000000.00');
    });

    it('availableCreditRial = creditLimit - reserved - consumed using Decimal', async () => {
      const result = await service.getCustomerReport({});
      const c = result.customers[0];
      expect(c.creditLimitRial).toBe('10000000.00');
      expect(c.consumedCreditRial).toBe('2000000.00');
      expect(c.reservedCreditRial).toBe('1000000.00');
      // 10_000_000 - 2_000_000 - 1_000_000 = 7_000_000
      expect(c.availableCreditRial).toBe('7000000.00');
    });

    it('returns KYC status from most recent verification', async () => {
      const result = await service.getCustomerReport({});
      expect(result.customers[0].kycStatus).toBe('APPROVED');
    });

    it('handles customer without account', async () => {
      mockRepo.getCustomerReport.mockResolvedValueOnce({
        total: 1,
        byType: [],
        byStatus: [],
        pendingKyc: 0,
        customers: [
          {
            id: 'c-2',
            customerNumber: 'CUST-000002',
            firstName: 'Sara',
            lastName: 'Karimi',
            mobile: '09123456789',
            type: null,
            status: 'PENDING',
            kycVerifications: [],
            account: null,
            createdAt: new Date(),
          },
        ],
      });
      const result = await service.getCustomerReport({});
      expect(result.customers[0].availableCreditRial).toBeNull();
      expect(result.customers[0].kycStatus).toBeNull();
    });
  });

  // ─── Trade Report ───────────────────────────────────────────────────────────

  describe('getTradeReport', () => {
    beforeEach(() => {
      mockRepo.getTradeReport.mockResolvedValue({
        total: 3,
        byStatus: [
          { status: 'CONFIRMED', _count: { id: 2 } },
          { status: 'REVERSED', _count: { id: 1 } },
        ],
        valueAgg: {
          _sum: {
            totalAmountRial: makeDecimal(15_000_000),
            weightGrams: makeDecimal(7.5),
          },
        },
        trades: [
          {
            id: 'trade-1',
            tradeNumber: 'TRD-000001',
            customerId: 'c-1',
            status: 'CONFIRMED',
            totalAmountRial: makeDecimal(5_000_000),
            weightGrams: makeDecimal(2.5),
            purityRatio: makeDecimal(0.75),
            customerType: 'VIP',
            confirmedAt: new Date('2026-01-15T10:00:00Z'),
            createdAt: new Date('2026-01-15T09:00:00Z'),
          },
        ],
      });
    });

    it('returns trade summary with totals', async () => {
      const result = await service.getTradeReport({});
      expect(result.total).toBe(3);
      expect(result.totalValueRial).toBe('15000000.00');
      expect(result.totalWeightGrams).toBe('7.500000');
    });

    it('formats Decimal fields as strings with correct precision', async () => {
      const result = await service.getTradeReport({});
      const t = result.trades[0];
      expect(t.totalAmountRial).toBe('5000000.00');
      expect(t.weightGrams).toBe('2.500000');
      expect(t.purityRatio).toBe('0.750000');
    });

    it('maps status breakdown correctly', async () => {
      const result = await service.getTradeReport({});
      expect(result.byStatus['CONFIRMED']).toBe(2);
      expect(result.byStatus['REVERSED']).toBe(1);
    });
  });

  // ─── Financial Report ───────────────────────────────────────────────────────

  describe('getFinancialReport', () => {
    beforeEach(() => {
      mockRepo.getFinancialReport.mockResolvedValue({
        accountBalances: [
          {
            accountCode: 'FA-01',
            accountName: 'Customer Receivable',
            accountType: 'ASSET',
            _sum: { debit: makeDecimal(1_000_000), credit: makeDecimal(200_000) },
          },
          {
            accountCode: 'FA-02',
            accountName: 'Customer Prepaid',
            accountType: 'LIABILITY',
            _sum: { debit: makeDecimal(0), credit: makeDecimal(500_000) },
          },
        ],
        totalEntries: 5,
        entries: [
          {
            id: 'e-1',
            journalId: 'j-1',
            accountCode: 'FA-01',
            accountName: 'Customer Receivable',
            accountType: 'ASSET',
            debit: makeDecimal(1_000_000),
            credit: makeDecimal(0),
            description: 'Trade confirmed',
            createdAt: new Date('2026-01-15T10:00:00Z'),
            journal: { sourceType: 'TRADE_CONFIRM', sourceId: 'trade-1' },
          },
        ],
      });
    });

    it('derives balances from ledger entries — not from trades', async () => {
      const result = await service.getFinancialReport({});
      // Should call repo.getFinancialReport, never write
      expect(mockRepo.getFinancialReport).toHaveBeenCalledTimes(1);
      expect(result.accountBalances).toHaveLength(2);
    });

    it('computes ASSET netBalance as debit - credit', async () => {
      const result = await service.getFinancialReport({});
      const fa01 = result.accountBalances.find((a) => a.accountCode === 'FA-01');
      expect(fa01?.netBalance).toBe('800000.00'); // 1_000_000 - 200_000
    });

    it('computes LIABILITY netBalance as credit - debit', async () => {
      const result = await service.getFinancialReport({});
      const fa02 = result.accountBalances.find((a) => a.accountCode === 'FA-02');
      expect(fa02?.netBalance).toBe('500000.00'); // 500_000 - 0
    });

    it('includes sourceType and sourceId from journal on each entry', async () => {
      const result = await service.getFinancialReport({});
      expect(result.entries[0].sourceType).toBe('TRADE_CONFIRM');
      expect(result.entries[0].sourceId).toBe('trade-1');
    });

    it('paginates entries correctly', async () => {
      const result = await service.getFinancialReport({ limit: 10, offset: 0 });
      expect(result.totalEntries).toBe(5);
      expect(result.entries).toHaveLength(1);
    });
  });

  // ─── Gold Report ────────────────────────────────────────────────────────────

  describe('getGoldReport', () => {
    beforeEach(() => {
      mockRepo.getGoldReport.mockResolvedValue({
        inBalances: [
          {
            accountCode: 'GA-01',
            accountName: 'Store Gold Position',
            _sum: { quantity: makeDecimal(100) },
          },
        ],
        outBalances: [
          {
            accountCode: 'GA-01',
            accountName: 'Store Gold Position',
            _sum: { quantity: makeDecimal(35) },
          },
        ],
        totalEntries: 10,
        entries: [
          {
            id: 'ge-1',
            journalId: 'gj-1',
            accountCode: 'GA-01',
            accountName: 'Store Gold Position',
            direction: 'IN',
            quantity: makeDecimal(50),
            purity: makeDecimal(0.75),
            description: 'Purchase confirmed',
            createdAt: new Date('2026-01-10T00:00:00Z'),
            journal: { sourceType: 'PURCHASE_CONFIRM', sourceId: 'pur-1' },
          },
        ],
      });
    });

    it('derives gold balance from ledger — never from orders/trades', async () => {
      const result = await service.getGoldReport({});
      expect(mockRepo.getGoldReport).toHaveBeenCalledTimes(1);
      expect(result.accountBalances).toHaveLength(1);
    });

    it('computes netQuantityGrams = totalIn - totalOut', async () => {
      const result = await service.getGoldReport({});
      expect(result.accountBalances[0].netQuantityGrams).toBe('65.000000'); // 100 - 35
    });

    it('formats gold quantities with 6 decimal places', async () => {
      const result = await service.getGoldReport({});
      expect(result.accountBalances[0].totalInGrams).toBe('100.000000');
      expect(result.accountBalances[0].totalOutGrams).toBe('35.000000');
    });
  });

  // ─── Payment Report ──────────────────────────────────────────────────────────

  describe('getPaymentReport', () => {
    beforeEach(() => {
      mockRepo.getPaymentReport.mockResolvedValue({
        total: 3,
        byStatus: [
          { status: 'VALIDATED', _count: { id: 2 } },
          { status: 'PENDING', _count: { id: 1 } },
        ],
        byMethod: [
          { method: 'BANK_TRANSFER', _sum: { amount: makeDecimal(8_000_000) } },
          { method: 'CASH', _sum: { amount: makeDecimal(2_000_000) } },
        ],
        valueAgg: { _sum: { amount: makeDecimal(10_000_000) } },
        payments: [
          {
            id: 'pmt-1',
            tradeId: 'trade-1',
            customerId: 'c-1',
            method: 'BANK_TRANSFER',
            amount: makeDecimal(8_000_000),
            status: 'VALIDATED',
            referenceNumber: 'REF-001',
            createdAt: new Date('2026-01-20T00:00:00Z'),
          },
        ],
      });
    });

    it('returns payment breakdown by method', async () => {
      const result = await service.getPaymentReport({});
      expect(result.byMethod['BANK_TRANSFER']).toBe('8000000.00');
      expect(result.byMethod['CASH']).toBe('2000000.00');
    });

    it('total value uses Decimal — never Float', async () => {
      const result = await service.getPaymentReport({});
      expect(result.totalValueRial).toBe('10000000.00');
    });
  });

  // ─── Settlement Report ───────────────────────────────────────────────────────

  describe('getSettlementReport', () => {
    beforeEach(() => {
      mockRepo.getSettlementReport.mockResolvedValue({
        totalSettled: 5,
        totalPending: 3,
        settledAgg: { _sum: { settledAmount: makeDecimal(25_000_000) } },
        pendingAgg: { _sum: { settledAmount: makeDecimal(5_000_000) } },
        settlements: [
          {
            id: 's-1',
            tradeId: 'trade-1',
            status: 'SETTLED',
            settledAmount: makeDecimal(5_000_000),
            createdAt: new Date('2026-01-20T00:00:00Z'),
          },
        ],
      });
    });

    it('returns settled vs pending counts and values', async () => {
      const result = await service.getSettlementReport({});
      expect(result.totalSettled).toBe(5);
      expect(result.totalPending).toBe(3);
      expect(result.totalSettledValueRial).toBe('25000000.00');
      expect(result.totalPendingValueRial).toBe('5000000.00');
    });
  });

  // ─── Audit Report ────────────────────────────────────────────────────────────

  describe('getAuditReport', () => {
    beforeEach(() => {
      mockRepo.getAuditReport.mockResolvedValue({
        total: 100,
        logs: [
          {
            id: 'al-1',
            actorId: 'user-1',
            actorType: 'USER',
            action: 'KYC_APPROVED',
            entityType: 'Customer',
            entityId: 'c-1',
            before: null,
            after: { status: 'APPROVED' },
            reason: 'Documents verified',
            ipAddress: '127.0.0.1',
            timestamp: new Date('2026-01-10T10:00:00Z'),
          },
        ],
      });
    });

    it('returns audit logs with pagination', async () => {
      const result = await service.getAuditReport({ limit: 50, offset: 0 });
      expect(result.total).toBe(100);
      expect(result.logs[0].action).toBe('KYC_APPROVED');
    });

    it('maps timestamp field to createdAt in DTO', async () => {
      const result = await service.getAuditReport({});
      expect(result.logs[0].createdAt).toBe('2026-01-10T10:00:00.000Z');
    });
  });

  // ─── Reports never modify business data ──────────────────────────────────────

  describe('read-only guarantee', () => {
    it('ReportsRepository has no write methods (create, update, delete)', () => {
      const repoProto = Object.getOwnPropertyNames(ReportsRepository.prototype);
      const writeMethods = repoProto.filter((name) =>
        /^(create|update|delete|upsert|save|insert|write|post)/i.test(name),
      );
      expect(writeMethods).toHaveLength(0);
    });

    it('ReportsService has no write methods', () => {
      const serviceProto = Object.getOwnPropertyNames(ReportsService.prototype);
      const writeMethods = serviceProto.filter((name) =>
        /^(create|update|delete|upsert|save|insert|write|post)/i.test(name),
      );
      expect(writeMethods).toHaveLength(0);
    });
  });

  // ─── Pagination ──────────────────────────────────────────────────────────────

  describe('pagination', () => {
    it('getOrderReport passes limit/offset to repository', async () => {
      mockRepo.getOrderReport.mockResolvedValue({
        total: 200,
        byStatus: [],
        valueAgg: { _sum: { totalAmountRial: null } },
        orders: [],
      });

      await service.getOrderReport({ limit: 25, offset: 50 });

      expect(mockRepo.getOrderReport).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 25, offset: 50 }),
      );
    });

    it('getTradeReport passes limit/offset to repository', async () => {
      mockRepo.getTradeReport.mockResolvedValue({
        total: 100,
        byStatus: [],
        valueAgg: { _sum: { totalAmountRial: null, weightGrams: null } },
        trades: [],
      });

      await service.getTradeReport({ limit: 10, offset: 100 });
      expect(mockRepo.getTradeReport).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 10, offset: 100 }),
      );
    });
  });

  // ─── Security / access ────────────────────────────────────────────────────────

  describe('security', () => {
    it('customer credit data comes only from CustomerAccount — not computed from trades', async () => {
      // The availableCreditRial is computed only from creditLimitRial, reservedCreditRial,
      // consumedCreditRial on CustomerAccount — never from Order/Trade aggregation.
      mockRepo.getCustomerReport.mockResolvedValueOnce({
        total: 1,
        byType: [],
        byStatus: [],
        pendingKyc: 0,
        customers: [
          {
            id: 'c-1',
            customerNumber: 'CUST-000001',
            firstName: 'Test',
            lastName: 'User',
            mobile: '09121111111',
            type: 'VIP',
            status: 'ACTIVE',
            kycVerifications: [],
            account: {
              creditLimitRial: makeDecimal(5_000_000),
              consumedCreditRial: makeDecimal(1_000_000),
              reservedCreditRial: makeDecimal(500_000),
            },
            createdAt: new Date(),
          },
        ],
      });

      const result = await service.getCustomerReport({});
      // available = 5_000_000 - 1_000_000 - 500_000 = 3_500_000
      expect(result.customers[0].availableCreditRial).toBe('3500000.00');
      // Verify we never called getTradeReport
      expect(mockRepo.getTradeReport).not.toHaveBeenCalled();
    });
  });
});
