/**
 * Gold Ledger Service — Unit Tests
 *
 * Tests cover:
 * 1. Decimal precision — quantities stored and returned as Decimal
 * 2. Positive/negative movements (IN/OUT directions)
 * 3. Balance calculation
 * 4. Duplicate posting prevention
 * 5. Source reference validation
 * 6. Unknown gold account rejected
 * 7. Zero quantity rejected
 */

import Decimal from 'decimal.js';
import { GoldLedgerService, PostGoldJournalInput } from './application/gold-ledger.service';
import { GoldLedgerRepository } from './infrastructure/repositories/gold-ledger.repository';
import {
  GoldLedgerJournalEntity,
  GoldLedgerEntryEntity,
} from './domain/entities/gold-ledger-journal.entity';
import { InvalidGoldQuantityException } from './domain/exceptions/gold-ledger.exceptions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeGoldJournal(
  entries: Array<{
    accountCode: string;
    direction: 'IN' | 'OUT';
    quantity: string;
    purity: string;
  }>,
): GoldLedgerJournalEntity {
  const entryEntities = entries.map(
    (e, i) =>
      new GoldLedgerEntryEntity({
        id: `entry-${i}`,
        journalId: 'gj-1',
        accountCode: e.accountCode,
        accountName: e.accountCode,
        direction: e.direction,
        quantity: new Decimal(e.quantity),
        purity: new Decimal(e.purity),
        description: null,
        createdAt: new Date(),
      }),
  );

  return new GoldLedgerJournalEntity({
    id: 'gj-1',
    idempotencyKey: 'test-gold-key',
    sourceType: 'TRADE_CONFIRM',
    sourceId: 'trade-1',
    description: null,
    postedAt: new Date(),
    postedByUserId: null,
    entries: entryEntities,
  });
}

function makeMockGoldRepo(): jest.Mocked<GoldLedgerRepository> {
  return {
    findJournalById: jest.fn(),
    findJournalByIdempotencyKey: jest.fn(),
    findJournalsBySource: jest.fn(),
    journalExists: jest.fn(),
    getAccountGoldBalance: jest.fn(),
    findEntriesByAccount: jest.fn(),
    findAllJournals: jest.fn(),
    createJournalInTx: jest.fn(),
    findGoldJournalsWithMissingTradeSource: jest.fn(),
    findDuplicateGoldPostings: jest.fn(),
  } as unknown as jest.Mocked<GoldLedgerRepository>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GoldLedgerService', () => {
  let service: GoldLedgerService;
  let repo: jest.Mocked<GoldLedgerRepository>;

  beforeEach(() => {
    repo = makeMockGoldRepo();
    service = new GoldLedgerService(repo);
  });

  // ─── 1. Decimal precision ──────────────────────────────────────────────────

  describe('Decimal precision', () => {
    it('accepts and stores gold quantity as Decimal (6 decimal places)', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      const journal = makeGoldJournal([
        { accountCode: 'GA-02', direction: 'IN', quantity: '0.123456', purity: '0.750000' },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const input: PostGoldJournalInput = {
        idempotencyKey: 'TRADE_CONFIRM_GOLD_trade-1',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-1',
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'IN',
            quantity: new Decimal('0.123456'),
            purity: new Decimal('0.750000'),
          },
        ],
      };

      const result = await service.postJournalInTx(tx, input);
      expect(result.wasAlreadyPosted).toBe(false);

      const savedEntry = repo.createJournalInTx.mock.calls[0][1].entries[0];
      expect(savedEntry.quantity.toFixed(6)).toBe('0.123456');
      expect(savedEntry.purity.toFixed(6)).toBe('0.750000');
    });

    it('preserves precision for very small gold quantities (molten gold)', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      const journal = makeGoldJournal([
        { accountCode: 'GA-02', direction: 'IN', quantity: '0.001234', purity: '0.995000' },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const result = await service.postJournalInTx(tx, {
        idempotencyKey: 'TRADE_CONFIRM_GOLD_small',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-small',
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'IN',
            quantity: new Decimal('0.001234'),
            purity: new Decimal('0.995000'),
          },
        ],
      });

      expect(result.wasAlreadyPosted).toBe(false);
      const savedEntry = repo.createJournalInTx.mock.calls[0][1].entries[0];
      // Must NOT lose precision
      expect(savedEntry.quantity.toString()).toBe('0.001234');
    });
  });

  // ─── 2. IN/OUT directions ──────────────────────────────────────────────────

  describe('Gold direction IN / OUT', () => {
    it('creates IN entry for Trade confirmation (GA-02 obligation created)', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      const journal = makeGoldJournal([
        { accountCode: 'GA-02', direction: 'IN', quantity: '10.5', purity: '0.750' },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const result = await service.postJournalInTx(tx, {
        idempotencyKey: 'TRADE_CONFIRM_GOLD_in-test',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-in',
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'IN',
            quantity: new Decimal('10.5'),
            purity: new Decimal('0.750'),
          },
        ],
      });

      expect(result.wasAlreadyPosted).toBe(false);
      const savedEntry = repo.createJournalInTx.mock.calls[0][1].entries[0];
      expect(savedEntry.direction).toBe('IN');
    });

    it('creates OUT entry for Trade reversal (GA-02 obligation released)', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      const journal = makeGoldJournal([
        { accountCode: 'GA-02', direction: 'OUT', quantity: '10.5', purity: '0.750' },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const result = await service.postJournalInTx(tx, {
        idempotencyKey: 'TRADE_REVERSAL_GOLD_out-test',
        sourceType: 'TRADE_REVERSAL',
        sourceId: 'trade-out',
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'OUT',
            quantity: new Decimal('10.5'),
            purity: new Decimal('0.750'),
          },
        ],
      });

      expect(result.wasAlreadyPosted).toBe(false);
      const savedEntry = repo.createJournalInTx.mock.calls[0][1].entries[0];
      expect(savedEntry.direction).toBe('OUT');
    });
  });

  // ─── 3. Balance calculation ────────────────────────────────────────────────

  describe('getAccountBalance (GA-02)', () => {
    it('returns net position = totalIn - totalOut as Decimal', async () => {
      repo.getAccountGoldBalance.mockResolvedValue({
        totalIn: new Decimal('100.500000'),
        totalOut: new Decimal('25.250000'),
        netPosition: new Decimal('75.250000'),
      });

      const balance = await service.getAccountBalance('GA-02');
      expect(balance.totalIn).toBe('100.500000');
      expect(balance.totalOut).toBe('25.250000');
      expect(balance.netPosition).toBe('75.250000');
    });

    it('GoldLedgerEntryEntity.signedQuantity() returns positive for IN', () => {
      const entry = new GoldLedgerEntryEntity({
        id: 'e1',
        journalId: 'j1',
        accountCode: 'GA-02',
        accountName: 'Gold Obligation',
        direction: 'IN',
        quantity: new Decimal('5.5'),
        purity: new Decimal('0.750'),
        description: null,
        createdAt: new Date(),
      });
      expect(entry.signedQuantity().toNumber()).toBe(5.5);
    });

    it('GoldLedgerEntryEntity.signedQuantity() returns negative for OUT', () => {
      const entry = new GoldLedgerEntryEntity({
        id: 'e2',
        journalId: 'j1',
        accountCode: 'GA-02',
        accountName: 'Gold Obligation',
        direction: 'OUT',
        quantity: new Decimal('3.0'),
        purity: new Decimal('0.750'),
        description: null,
        createdAt: new Date(),
      });
      expect(entry.signedQuantity().toNumber()).toBe(-3.0);
    });
  });

  // ─── 4. Duplicate posting prevention ──────────────────────────────────────

  describe('duplicate posting prevention', () => {
    it('returns wasAlreadyPosted=true when idempotency key exists', async () => {
      const existingJournal = {
        id: 'gj-existing',
        idempotencyKey: 'TRADE_CONFIRM_GOLD_trade-dup',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-dup',
        description: null,
        postedAt: new Date(),
        postedByUserId: null,
        entries: [],
      };

      const tx = {
        goldLedgerJournal: {
          findUnique: jest.fn().mockResolvedValue(existingJournal),
        },
      } as any;

      const result = await service.postJournalInTx(tx, {
        idempotencyKey: 'TRADE_CONFIRM_GOLD_trade-dup',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-dup',
        entries: [
          {
            accountCode: 'GA-02',
            direction: 'IN',
            quantity: new Decimal('5'),
            purity: new Decimal('0.750'),
          },
        ],
      });

      expect(result.wasAlreadyPosted).toBe(true);
      expect(repo.createJournalInTx).not.toHaveBeenCalled();
    });
  });

  // ─── 5. Zero/negative quantity rejected ───────────────────────────────────

  describe('quantity validation', () => {
    it('throws InvalidGoldQuantityException for zero quantity', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.postJournalInTx(tx, {
          idempotencyKey: 'zero-qty',
          sourceType: 'MANUAL',
          sourceId: 'src-1',
          entries: [
            {
              accountCode: 'GA-02',
              direction: 'IN',
              quantity: new Decimal('0'), // INVALID
              purity: new Decimal('0.750'),
            },
          ],
        }),
      ).rejects.toThrow(InvalidGoldQuantityException);
    });

    it('throws InvalidGoldQuantityException for negative quantity', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.postJournalInTx(tx, {
          idempotencyKey: 'neg-qty',
          sourceType: 'MANUAL',
          sourceId: 'src-1',
          entries: [
            {
              accountCode: 'GA-02',
              direction: 'IN',
              quantity: new Decimal('-1.5'), // INVALID
              purity: new Decimal('0.750'),
            },
          ],
        }),
      ).rejects.toThrow(InvalidGoldQuantityException);
    });
  });

  // ─── 6. Unknown account rejected ──────────────────────────────────────────

  describe('unknown gold account rejected', () => {
    it('throws error for undefined gold account code', async () => {
      const tx = {
        goldLedgerJournal: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.postJournalInTx(tx, {
          idempotencyKey: 'unknown-gold-account',
          sourceType: 'MANUAL',
          sourceId: 'src-1',
          entries: [
            {
              accountCode: 'GA-99', // DOES NOT EXIST
              direction: 'IN',
              quantity: new Decimal('1'),
              purity: new Decimal('0.750'),
            },
          ],
        }),
      ).rejects.toThrow();
    });
  });

  // ─── 7. Immutability ──────────────────────────────────────────────────────

  describe('immutability', () => {
    it('GoldLedgerRepository does not expose update or delete methods', () => {
      const proto = Object.getOwnPropertyNames(GoldLedgerRepository.prototype);
      expect(proto).not.toContain('updateJournal');
      expect(proto).not.toContain('deleteJournal');
      expect(proto).not.toContain('updateEntry');
      expect(proto).not.toContain('deleteEntry');
    });
  });

  // ─── 8. GoldLedgerJournalEntity helpers ───────────────────────────────────

  describe('GoldLedgerJournalEntity', () => {
    it('netQuantityForAccount returns correct signed sum', () => {
      const journal = makeGoldJournal([
        { accountCode: 'GA-02', direction: 'IN', quantity: '100', purity: '0.750' },
        { accountCode: 'GA-02', direction: 'OUT', quantity: '30', purity: '0.750' },
      ]);

      const net = journal.netQuantityForAccount('GA-02');
      expect(net.toNumber()).toBe(70); // 100 IN - 30 OUT = 70
    });
  });

  // ─── 9. Reconciliation ────────────────────────────────────────────────────

  describe('reconcile()', () => {
    it('returns healthy report when no issues', async () => {
      repo.findDuplicateGoldPostings.mockResolvedValue([]);
      repo.findGoldJournalsWithMissingTradeSource.mockResolvedValue([]);
      repo.getAccountGoldBalance.mockResolvedValue({
        totalIn: new Decimal('100'),
        totalOut: new Decimal('30'),
        netPosition: new Decimal('70'),
      });

      const report = await service.reconcile();
      expect(report.isHealthy).toBe(true);
      expect(report.duplicatePostings).toHaveLength(0);
      expect(report.missingSourceReferences).toHaveLength(0);
    });

    it('does NOT modify data during reconciliation', async () => {
      repo.findDuplicateGoldPostings.mockResolvedValue([]);
      repo.findGoldJournalsWithMissingTradeSource.mockResolvedValue([]);
      repo.getAccountGoldBalance.mockResolvedValue({
        totalIn: new Decimal('0'),
        totalOut: new Decimal('0'),
        netPosition: new Decimal('0'),
      });

      await service.reconcile();
      expect(repo.createJournalInTx).not.toHaveBeenCalled();
    });
  });
});
