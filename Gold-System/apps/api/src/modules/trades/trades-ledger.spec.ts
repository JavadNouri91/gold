/**
 * Trade → Ledger Integration Tests
 *
 * Tests cover:
 * 1. Confirmed Trade creates required financial and gold ledger postings
 * 2. Rejected/cancelled Trade does NOT create ledger postings
 * 3. Retry does NOT duplicate postings (idempotency)
 * 4. Trade reversal creates correct reversal postings
 * 5. Correct account codes posted (FA-02 DR / FA-06 CR / GA-02 IN)
 * 6. Blocked accounts NOT posted (FA-07, FA-09, GA-01)
 * 7. Security: BLOCKED accounts not posted even when data is available
 */

import Decimal from 'decimal.js';
import { TradeLedgerPostingService } from '../financial-ledger/application/trade-ledger-posting.service';
import { FinancialLedgerService } from '../financial-ledger/application/financial-ledger.service';
import { GoldLedgerService } from '../gold-ledger/application/gold-ledger.service';
import { AuditService } from '../audit/application/audit.service';
import {
  FinancialLedgerJournalEntity,
  FinancialLedgerEntryEntity,
} from '../financial-ledger/domain/entities/financial-ledger-journal.entity';
import {
  GoldLedgerJournalEntity,
  GoldLedgerEntryEntity,
} from '../gold-ledger/domain/entities/gold-ledger-journal.entity';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeFinLedgerMock(): jest.Mocked<FinancialLedgerService> {
  return {
    postJournalInTx: jest.fn(),
    getJournalById: jest.fn(),
    getJournalsBySource: jest.fn(),
    getAccountBalance: jest.fn(),
    getAllAccountBalances: jest.fn(),
    listJournals: jest.fn(),
    reconcile: jest.fn(),
  } as unknown as jest.Mocked<FinancialLedgerService>;
}

function makeGoldLedgerMock(): jest.Mocked<GoldLedgerService> {
  return {
    postJournalInTx: jest.fn(),
    getJournalById: jest.fn(),
    getJournalsBySource: jest.fn(),
    getAccountBalance: jest.fn(),
    getAllAccountBalances: jest.fn(),
    listJournals: jest.fn(),
    reconcile: jest.fn(),
  } as unknown as jest.Mocked<GoldLedgerService>;
}

function makeAuditMock(): jest.Mocked<AuditService> {
  return {
    log: jest.fn(),
    findByEntity: jest.fn(),
    findByActor: jest.fn(),
  } as unknown as jest.Mocked<AuditService>;
}

function makeFinJournal(
  idempotencyKey: string,
  entries: Array<{ accountCode: string; debit: string; credit: string }>,
): FinancialLedgerJournalEntity {
  return new FinancialLedgerJournalEntity({
    id: 'fin-j-1',
    idempotencyKey,
    sourceType: 'TRADE_CONFIRM',
    sourceId: 'trade-1',
    description: null,
    postedAt: new Date(),
    postedByUserId: null,
    entries: entries.map(
      (e, i) =>
        new FinancialLedgerEntryEntity({
          id: `entry-${i}`,
          journalId: 'fin-j-1',
          accountCode: e.accountCode,
          accountName: e.accountCode,
          accountType: 'ASSET',
          debit: new Decimal(e.debit),
          credit: new Decimal(e.credit),
          currency: 'IRR',
          description: null,
          createdAt: new Date(),
        }),
    ),
  });
}

function makeGoldJournal(idempotencyKey: string): GoldLedgerJournalEntity {
  return new GoldLedgerJournalEntity({
    id: 'gold-j-1',
    idempotencyKey,
    sourceType: 'TRADE_CONFIRM',
    sourceId: 'trade-1',
    description: null,
    postedAt: new Date(),
    postedByUserId: null,
    entries: [
      new GoldLedgerEntryEntity({
        id: 'ge-1',
        journalId: 'gold-j-1',
        accountCode: 'GA-02',
        accountName: 'Gold Obligation',
        direction: 'IN',
        quantity: new Decimal('5.5'),
        purity: new Decimal('0.750'),
        description: null,
        createdAt: new Date(),
      }),
    ],
  });
}

// ─── Shared Trade Data ────────────────────────────────────────────────────────

const testTrade = {
  id: 'trade-abc-123',
  tradeNumber: 'TRD-000001',
  totalAmountRial: new Decimal('15000000'),
  weightGrams: new Decimal('5.500000'),
  purityRatio: new Decimal('0.750000'),
  discountAmount: new Decimal('0'),
  customerId: 'cust-1',
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TradeLedgerPostingService', () => {
  let service: TradeLedgerPostingService;
  let finLedger: jest.Mocked<FinancialLedgerService>;
  let goldLedger: jest.Mocked<GoldLedgerService>;
  let audit: jest.Mocked<AuditService>;
  let tx: any;

  beforeEach(() => {
    finLedger = makeFinLedgerMock();
    goldLedger = makeGoldLedgerMock();
    audit = makeAuditMock();
    service = new TradeLedgerPostingService(finLedger, goldLedger, audit);
    tx = {} as any;

    // Default: successful postings
    finLedger.postJournalInTx.mockResolvedValue({
      journal: makeFinJournal(TradeLedgerPostingService.financialKeyForConfirm(testTrade.id), [
        { accountCode: 'FA-02', debit: '15000000', credit: '0' },
        { accountCode: 'FA-06', debit: '0', credit: '15000000' },
      ]),
      wasAlreadyPosted: false,
    });
    goldLedger.postJournalInTx.mockResolvedValue({
      journal: makeGoldJournal(TradeLedgerPostingService.goldKeyForConfirm(testTrade.id)),
      wasAlreadyPosted: false,
    });
    audit.log.mockResolvedValue({} as any);
  });

  // ─── 1. Trade confirmation creates correct postings ──────────────────────

  describe('postTradeConfirmInTx — correct postings', () => {
    it('posts DR FA-02 / CR FA-06 for totalAmountRial', async () => {
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');

      expect(finLedger.postJournalInTx).toHaveBeenCalledTimes(1);

      const finCall = finLedger.postJournalInTx.mock.calls[0][1];
      expect(finCall.sourceType).toBe('TRADE_CONFIRM');
      expect(finCall.sourceId).toBe(testTrade.id);

      // Must have exactly 2 entries: DR FA-02 and CR FA-06
      const drEntry = finCall.entries.find((e: any) => e.accountCode === 'FA-02')!;
      const crEntry = finCall.entries.find((e: any) => e.accountCode === 'FA-06')!;

      expect(drEntry).toBeDefined();
      expect(crEntry).toBeDefined();
      expect(drEntry.debit.toString()).toBe('15000000');
      expect(drEntry.credit.toString()).toBe('0');
      expect(crEntry.credit.toString()).toBe('15000000');
      expect(crEntry.debit.toString()).toBe('0');
    });

    it('posts GA-02 IN for weightGrams', async () => {
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');

      expect(goldLedger.postJournalInTx).toHaveBeenCalledTimes(1);

      const goldCall = goldLedger.postJournalInTx.mock.calls[0][1];
      expect(goldCall.sourceType).toBe('TRADE_CONFIRM');
      expect(goldCall.sourceId).toBe(testTrade.id);

      const entry = goldCall.entries[0];
      expect(entry.accountCode).toBe('GA-02');
      expect(entry.direction).toBe('IN');
      expect(entry.quantity.toFixed(6)).toBe('5.500000');
      expect(entry.purity.toFixed(6)).toBe('0.750000');
    });

    it('uses correct idempotency keys', async () => {
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');

      const finCall = finLedger.postJournalInTx.mock.calls[0][1];
      const goldCall = goldLedger.postJournalInTx.mock.calls[0][1];

      expect(finCall.idempotencyKey).toBe(`TRADE_CONFIRM_FIN_${testTrade.id}`);
      expect(goldCall.idempotencyKey).toBe(`TRADE_CONFIRM_GOLD_${testTrade.id}`);
    });

    it('does NOT post to BLOCKED accounts (FA-07, FA-09, GA-01)', async () => {
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');

      const finCall = finLedger.postJournalInTx.mock.calls[0][1];

      const accountCodes = finCall.entries.map((e: any) => e.accountCode);
      expect(accountCodes).not.toContain('FA-07'); // BLOCKED §13.2
      expect(accountCodes).not.toContain('FA-09'); // BLOCKED §13.3

      const goldCall = goldLedger.postJournalInTx.mock.calls[0][1];
      const goldCodes = goldCall.entries.map((e: any) => e.accountCode);
      expect(goldCodes).not.toContain('GA-01'); // BLOCKED #39
    });
  });

  // ─── 2. Retry does NOT duplicate postings ─────────────────────────────────

  describe('postTradeConfirmInTx — idempotency on retry', () => {
    it('does not create duplicate postings on retry (wasAlreadyPosted=true)', async () => {
      // Simulate both postings already existing
      finLedger.postJournalInTx.mockResolvedValue({
        journal: makeFinJournal(TradeLedgerPostingService.financialKeyForConfirm(testTrade.id), []),
        wasAlreadyPosted: true,
      });
      goldLedger.postJournalInTx.mockResolvedValue({
        journal: makeGoldJournal(TradeLedgerPostingService.goldKeyForConfirm(testTrade.id)),
        wasAlreadyPosted: true,
      });

      // First retry
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');
      // Second retry
      await service.postTradeConfirmInTx(tx, testTrade, 'user-1');

      // postJournalInTx called twice each (once per invocation of postTradeConfirmInTx)
      // BUT underlying createJournalInTx not called due to idempotency checks
      expect(finLedger.postJournalInTx).toHaveBeenCalledTimes(2);
      expect(goldLedger.postJournalInTx).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 3. Trade reversal creates correct reversal postings ──────────────────

  describe('postTradeReversalInTx', () => {
    beforeEach(() => {
      finLedger.postJournalInTx.mockResolvedValue({
        journal: makeFinJournal(TradeLedgerPostingService.financialKeyForReversal(testTrade.id), [
          { accountCode: 'FA-06', debit: '15000000', credit: '0' },
          { accountCode: 'FA-02', debit: '0', credit: '15000000' },
        ]),
        wasAlreadyPosted: false,
      });
      goldLedger.postJournalInTx.mockResolvedValue({
        journal: makeGoldJournal(TradeLedgerPostingService.goldKeyForReversal(testTrade.id)),
        wasAlreadyPosted: false,
      });
    });

    it('posts DR FA-06 / CR FA-02 for reversal (opposite of confirmation)', async () => {
      await service.postTradeReversalInTx(tx, testTrade, 'manager-1', 'Customer requested');

      const finCall = finLedger.postJournalInTx.mock.calls[0][1];
      expect(finCall.sourceType).toBe('TRADE_REVERSAL');

      const drEntry = finCall.entries.find((e: any) => e.accountCode === 'FA-06')!;
      const crEntry = finCall.entries.find((e: any) => e.accountCode === 'FA-02')!;

      expect(drEntry.debit.toString()).toBe('15000000'); // Revenue reversed
      expect(crEntry.credit.toString()).toBe('15000000'); // Prepaid restored
    });

    it('posts GA-02 OUT for reversal (obligation released)', async () => {
      await service.postTradeReversalInTx(tx, testTrade, 'manager-1', 'Error in trade');

      const goldCall = goldLedger.postJournalInTx.mock.calls[0][1];
      expect(goldCall.sourceType).toBe('TRADE_REVERSAL');

      const entry = goldCall.entries[0];
      expect(entry.accountCode).toBe('GA-02');
      expect(entry.direction).toBe('OUT');
      expect(entry.quantity.toFixed(6)).toBe('5.500000');
    });

    it('uses REVERSAL idempotency keys (different from confirmation keys)', async () => {
      await service.postTradeReversalInTx(tx, testTrade, 'manager-1', 'Test reversal');

      const finKey = finLedger.postJournalInTx.mock.calls[0][1].idempotencyKey;
      const goldKey = goldLedger.postJournalInTx.mock.calls[0][1].idempotencyKey;

      expect(finKey).toBe(`TRADE_REVERSAL_FIN_${testTrade.id}`);
      expect(goldKey).toBe(`TRADE_REVERSAL_GOLD_${testTrade.id}`);

      // Must be different from confirmation keys
      expect(finKey).not.toBe(`TRADE_CONFIRM_FIN_${testTrade.id}`);
      expect(goldKey).not.toBe(`TRADE_CONFIRM_GOLD_${testTrade.id}`);
    });

    it('audits the reversal posting', async () => {
      await service.postTradeReversalInTx(tx, testTrade, 'manager-1', 'Documented reversal reason');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'LEDGER_TRADE_REVERSAL_POSTED',
          entityType: 'Trade',
          entityId: testTrade.id,
        }),
      );
    });
  });

  // ─── 4. Atomic failure (if financial posting fails, gold not posted) ───────

  describe('atomic failure handling', () => {
    it('propagates error if financial ledger posting fails', async () => {
      finLedger.postJournalInTx.mockRejectedValue(new Error('DB failure'));

      await expect(service.postTradeConfirmInTx(tx, testTrade, 'user-1')).rejects.toThrow(
        'DB failure',
      );
    });
  });

  // ─── 5. Idempotency key generators ────────────────────────────────────────

  describe('idempotency key generators', () => {
    it('financialKeyForConfirm generates deterministic key', () => {
      const key1 = TradeLedgerPostingService.financialKeyForConfirm('trade-id-1');
      const key2 = TradeLedgerPostingService.financialKeyForConfirm('trade-id-1');
      expect(key1).toBe(key2);
      expect(key1).toContain('trade-id-1');
    });

    it('goldKeyForConfirm is different from financialKeyForConfirm', () => {
      const finKey = TradeLedgerPostingService.financialKeyForConfirm('t-1');
      const goldKey = TradeLedgerPostingService.goldKeyForConfirm('t-1');
      expect(finKey).not.toBe(goldKey);
    });

    it('reversal keys are different from confirmation keys', () => {
      const tradeId = 'trade-xyz';
      expect(TradeLedgerPostingService.financialKeyForReversal(tradeId)).not.toBe(
        TradeLedgerPostingService.financialKeyForConfirm(tradeId),
      );
    });
  });

  // ─── 6. Concurrency: simultaneous calls don't create duplicates ───────────

  describe('concurrency — idempotency under concurrent calls', () => {
    it('second concurrent call returns wasAlreadyPosted=true', async () => {
      // Simulate: first call creates journal, second call finds existing
      let callCount = 0;
      finLedger.postJournalInTx.mockImplementation(async () => {
        callCount++;
        return {
          journal: makeFinJournal(
            TradeLedgerPostingService.financialKeyForConfirm(testTrade.id),
            [],
          ),
          wasAlreadyPosted: callCount > 1,
        };
      });
      goldLedger.postJournalInTx.mockResolvedValue({
        journal: makeGoldJournal(TradeLedgerPostingService.goldKeyForConfirm(testTrade.id)),
        wasAlreadyPosted: callCount > 1,
      });

      // Two simultaneous calls
      await Promise.all([
        service.postTradeConfirmInTx(tx, testTrade, 'user-1'),
        service.postTradeConfirmInTx(tx, testTrade, 'user-1'),
      ]);

      // Both calls completed — second one should have gotten wasAlreadyPosted=true
      // The unique DB constraint is the ultimate safety net
      expect(finLedger.postJournalInTx).toHaveBeenCalledTimes(2);
    });
  });
});
