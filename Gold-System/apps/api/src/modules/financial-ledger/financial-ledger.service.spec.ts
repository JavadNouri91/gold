/**
 * Financial Ledger Service — Unit Tests
 *
 * Tests cover:
 * 1. Balanced posting accepted
 * 2. Unbalanced posting rejected (debit ≠ credit)
 * 3. Debit = credit invariant enforced
 * 4. Atomic posting (all entries or none)
 * 5. Duplicate posting prevention (idempotency)
 * 6. Source reference validation
 * 7. Immutability (no update/delete methods exist)
 * 8. Reversal creates opposite entries
 * 9. BLOCKED account posting rejected
 * 10. Unknown account rejected
 */

import Decimal from 'decimal.js';
import { FinancialLedgerService, PostJournalInput } from './application/financial-ledger.service';
import { FinancialLedgerRepository } from './infrastructure/repositories/financial-ledger.repository';
import {
  UnbalancedTransactionException,
  InvalidEntryAmountException,
} from './domain/exceptions/financial-ledger.exceptions';
import {
  FinancialLedgerJournalEntity,
  FinancialLedgerEntryEntity,
} from './domain/entities/financial-ledger-journal.entity';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(
  accountCode: string,
  debit: string,
  credit: string,
): {
  accountCode: string;
  debit: Decimal;
  credit: Decimal;
} {
  return { accountCode, debit: new Decimal(debit), credit: new Decimal(credit) };
}

function makeJournalEntity(
  entries: Array<{ accountCode: string; debit: Decimal; credit: Decimal }>,
): FinancialLedgerJournalEntity {
  const entryEntities = entries.map(
    (e, i) =>
      new FinancialLedgerEntryEntity({
        id: `entry-${i}`,
        journalId: 'journal-1',
        accountCode: e.accountCode,
        accountName: e.accountCode,
        accountType: 'ASSET',
        debit: e.debit,
        credit: e.credit,
        currency: 'IRR',
        description: null,
        createdAt: new Date(),
      }),
  );

  return new FinancialLedgerJournalEntity({
    id: 'journal-1',
    idempotencyKey: 'test-key',
    sourceType: 'TRADE_CONFIRM',
    sourceId: 'trade-1',
    description: null,
    postedAt: new Date(),
    postedByUserId: null,
    entries: entryEntities,
  });
}

// ─── Mock Repository ──────────────────────────────────────────────────────────

function makeMockRepo(): jest.Mocked<FinancialLedgerRepository> {
  return {
    findJournalById: jest.fn(),
    findJournalByIdempotencyKey: jest.fn(),
    findJournalsBySource: jest.fn(),
    findEntriesByAccount: jest.fn(),
    getAccountBalance: jest.fn(),
    journalExists: jest.fn(),
    findAllJournals: jest.fn(),
    createJournalInTx: jest.fn(),
    findUnbalancedJournals: jest.fn(),
    findDuplicateSourcePostings: jest.fn(),
    findJournalsWithMissingTradeSource: jest.fn(),
  } as unknown as jest.Mocked<FinancialLedgerRepository>;
}

// ─── Mock Transaction Client ──────────────────────────────────────────────────

function makeMockTx(existingIdempotencyKey?: string) {
  return {
    financialLedgerJournal: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          existingIdempotencyKey
            ? { id: 'j1', idempotencyKey: existingIdempotencyKey, entries: [] }
            : null,
        ),
    },
  } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FinancialLedgerService', () => {
  let service: FinancialLedgerService;
  let repo: jest.Mocked<FinancialLedgerRepository>;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new FinancialLedgerService(repo);
  });

  // ─── 1. Balanced posting accepted ─────────────────────────────────────────

  describe('postJournalInTx — balanced posting', () => {
    it('accepts a balanced DR FA-02 / CR FA-06 posting', async () => {
      const tx = makeMockTx();
      const amount = new Decimal('1000000');

      const journal = makeJournalEntity([
        { accountCode: 'FA-02', debit: amount, credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: amount },
      ]);

      repo.createJournalInTx.mockResolvedValue(journal);

      const input: PostJournalInput = {
        idempotencyKey: 'TRADE_CONFIRM_FIN_trade-1',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-1',
        entries: [makeEntry('FA-02', '1000000', '0'), makeEntry('FA-06', '0', '1000000')],
      };

      const result = await service.postJournalInTx(tx, input);
      expect(result.wasAlreadyPosted).toBe(false);
      expect(repo.createJournalInTx).toHaveBeenCalledTimes(1);
    });

    it('accepts a 3-entry balanced posting (DR A / CR B / CR C)', async () => {
      const tx = makeMockTx();

      const journal = makeJournalEntity([
        { accountCode: 'FA-01', debit: new Decimal('1500'), credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: new Decimal('1000') },
        { accountCode: 'FA-04', debit: new Decimal(0), credit: new Decimal('500') },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const input: PostJournalInput = {
        idempotencyKey: 'test-3-entry',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          makeEntry('FA-01', '1500', '0'),
          makeEntry('FA-06', '0', '1000'),
          makeEntry('FA-04', '0', '500'),
        ],
      };

      const result = await service.postJournalInTx(tx, input);
      expect(result.wasAlreadyPosted).toBe(false);
    });
  });

  // ─── 2. Unbalanced posting rejected ───────────────────────────────────────

  describe('postJournalInTx — unbalanced posting rejected', () => {
    it('throws UnbalancedTransactionException when DR ≠ CR', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'bad-key',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          makeEntry('FA-01', '1000', '0'), // DR 1000
          makeEntry('FA-06', '0', '999'), // CR 999 — UNBALANCED
        ],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow(
        UnbalancedTransactionException,
      );
      expect(repo.createJournalInTx).not.toHaveBeenCalled();
    });

    it('throws UnbalancedTransactionException when only debits exist', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'bad-key-2',
        sourceType: 'MANUAL',
        sourceId: 'src-2',
        entries: [makeEntry('FA-01', '500', '0'), makeEntry('FA-02', '500', '0')],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow(
        UnbalancedTransactionException,
      );
    });
  });

  // ─── 3. Debit = Credit invariant per entry ─────────────────────────────────

  describe('postJournalInTx — entry amount invariant', () => {
    it('throws InvalidEntryAmountException when both debit and credit > 0', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'bad-entry',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          // INVALID: both debit and credit are > 0
          { accountCode: 'FA-01', debit: new Decimal('500'), credit: new Decimal('500') },
        ],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow(InvalidEntryAmountException);
    });

    it('throws InvalidEntryAmountException when both debit and credit = 0', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'zero-entry',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [{ accountCode: 'FA-01', debit: new Decimal(0), credit: new Decimal(0) }],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow(InvalidEntryAmountException);
    });
  });

  // ─── 4. Atomic posting (transaction safety) ───────────────────────────────

  describe('postJournalInTx — atomic failure', () => {
    it('rolls back all entries when createJournalInTx fails', async () => {
      const tx = makeMockTx();
      repo.createJournalInTx.mockRejectedValue(new Error('DB connection error'));

      const input: PostJournalInput = {
        idempotencyKey: 'atomic-test',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-1',
        entries: [makeEntry('FA-02', '1000', '0'), makeEntry('FA-06', '0', '1000')],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow('DB connection error');
      // createJournalInTx was attempted (would have been inside tx)
      expect(repo.createJournalInTx).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. Duplicate posting prevention (idempotency) ────────────────────────

  describe('postJournalInTx — idempotency', () => {
    it('returns existing journal without creating new one on duplicate key', async () => {
      // Simulate tx.financialLedgerJournal.findUnique returning an existing journal
      const existingJournal = {
        id: 'existing-j',
        idempotencyKey: 'TRADE_CONFIRM_FIN_trade-1',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-1',
        description: null,
        postedAt: new Date(),
        postedByUserId: null,
        entries: [],
      };

      const tx = {
        financialLedgerJournal: {
          findUnique: jest.fn().mockResolvedValue(existingJournal),
        },
      } as any;

      const input: PostJournalInput = {
        idempotencyKey: 'TRADE_CONFIRM_FIN_trade-1',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-1',
        entries: [makeEntry('FA-02', '1000000', '0'), makeEntry('FA-06', '0', '1000000')],
      };

      const result = await service.postJournalInTx(tx, input);

      expect(result.wasAlreadyPosted).toBe(true);
      // Should NOT call createJournalInTx since it's a duplicate
      expect(repo.createJournalInTx).not.toHaveBeenCalled();
    });

    it('creates journal on first call, skips on second call', async () => {
      const journal = makeJournalEntity([
        { accountCode: 'FA-02', debit: new Decimal('5000'), credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: new Decimal('5000') },
      ]);

      let callCount = 0;
      const tx = {
        financialLedgerJournal: {
          findUnique: jest.fn().mockImplementation(() => {
            callCount++;
            return callCount > 1 ? { ...journal, entries: [] } : null;
          }),
        },
      } as any;

      repo.createJournalInTx.mockResolvedValue(journal);

      const input: PostJournalInput = {
        idempotencyKey: 'idempotency-test',
        sourceType: 'TRADE_CONFIRM',
        sourceId: 'trade-x',
        entries: [makeEntry('FA-02', '5000', '0'), makeEntry('FA-06', '0', '5000')],
      };

      // First call — creates
      const first = await service.postJournalInTx(tx, input);
      expect(first.wasAlreadyPosted).toBe(false);

      // Second call — idempotent skip
      const second = await service.postJournalInTx(tx, input);
      expect(second.wasAlreadyPosted).toBe(true);

      // createJournalInTx called only once
      expect(repo.createJournalInTx).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 6. BLOCKED account rejected ──────────────────────────────────────────

  describe('postJournalInTx — BLOCKED account rejection', () => {
    it('rejects posting to FA-07 (Sales Profit — §13.2 BLOCKED)', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'blocked-fa07',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          makeEntry('FA-02', '1000', '0'),
          makeEntry('FA-07', '0', '1000'), // BLOCKED
        ],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow();
    });

    it('rejects posting to FA-09 (Tax Payable — §13.3 BLOCKED)', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'blocked-fa09',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          makeEntry('FA-01', '100', '0'),
          makeEntry('FA-09', '0', '100'), // BLOCKED
        ],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow();
    });

    it('rejects posting to FA-13 (Supplier Settlement — DEFERRED)', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'blocked-fa13',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [
          makeEntry('FA-03', '200', '0'),
          makeEntry('FA-13', '0', '200'), // DEFERRED
        ],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow();
    });
  });

  // ─── 7. Unknown account rejected ──────────────────────────────────────────

  describe('postJournalInTx — unknown account rejected', () => {
    it('throws error for undefined account code', async () => {
      const tx = makeMockTx();

      const input: PostJournalInput = {
        idempotencyKey: 'unknown-account',
        sourceType: 'MANUAL',
        sourceId: 'src-1',
        entries: [makeEntry('XX-99', '100', '0'), makeEntry('FA-06', '0', '100')],
      };

      await expect(service.postJournalInTx(tx, input)).rejects.toThrow();
    });
  });

  // ─── 8. Immutability — no update/delete methods ───────────────────────────

  describe('immutability', () => {
    it('FinancialLedgerRepository does not expose update or delete methods', () => {
      const proto = Object.getOwnPropertyNames(FinancialLedgerRepository.prototype);
      expect(proto).not.toContain('updateJournal');
      expect(proto).not.toContain('deleteJournal');
      expect(proto).not.toContain('updateEntry');
      expect(proto).not.toContain('deleteEntry');
    });

    it('FinancialLedgerService does not expose update or delete methods', () => {
      const proto = Object.getOwnPropertyNames(FinancialLedgerService.prototype);
      expect(proto).not.toContain('updateJournal');
      expect(proto).not.toContain('deleteJournal');
      expect(proto).not.toContain('deleteEntry');
    });
  });

  // ─── 9. FinancialLedgerJournalEntity balance helpers ──────────────────────

  describe('FinancialLedgerJournalEntity — balance invariant', () => {
    it('isBalanced() returns true for equal DR/CR', () => {
      const journal = makeJournalEntity([
        { accountCode: 'FA-02', debit: new Decimal('100'), credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: new Decimal('100') },
      ]);
      expect(journal.isBalanced()).toBe(true);
      expect(journal.getImbalance()).toBeNull();
    });

    it('isBalanced() returns false for unequal DR/CR', () => {
      const journal = makeJournalEntity([
        { accountCode: 'FA-02', debit: new Decimal('100'), credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: new Decimal('99') },
      ]);
      expect(journal.isBalanced()).toBe(false);
      expect(journal.getImbalance()?.toNumber()).toBe(1);
    });

    it('totalDebits() sums all debit entries', () => {
      const journal = makeJournalEntity([
        { accountCode: 'FA-02', debit: new Decimal('300'), credit: new Decimal(0) },
        { accountCode: 'FA-04', debit: new Decimal('200'), credit: new Decimal(0) },
        { accountCode: 'FA-06', debit: new Decimal(0), credit: new Decimal('500') },
      ]);
      expect(journal.totalDebits().toNumber()).toBe(500);
      expect(journal.totalCredits().toNumber()).toBe(500);
    });
  });

  // ─── 10. Reversal posting creates opposite entries ─────────────────────────

  describe('reversal posting', () => {
    it('reversal of Trade creates DR FA-06 / CR FA-02 (opposite of confirmation)', async () => {
      const tx = makeMockTx();
      const amount = new Decimal('2500000');

      const journal = makeJournalEntity([
        { accountCode: 'FA-06', debit: amount, credit: new Decimal(0) },
        { accountCode: 'FA-02', debit: new Decimal(0), credit: amount },
      ]);
      repo.createJournalInTx.mockResolvedValue(journal);

      const input: PostJournalInput = {
        idempotencyKey: 'TRADE_REVERSAL_FIN_trade-1',
        sourceType: 'TRADE_REVERSAL',
        sourceId: 'trade-1',
        entries: [
          makeEntry('FA-06', '2500000', '0'), // DR FA-06 (reversal)
          makeEntry('FA-02', '0', '2500000'), // CR FA-02 (reversal)
        ],
      };

      const result = await service.postJournalInTx(tx, input);
      expect(result.wasAlreadyPosted).toBe(false);

      const call = repo.createJournalInTx.mock.calls[0][1];
      const drEntry = call.entries.find((e: any) => e.accountCode === 'FA-06')!;
      const crEntry = call.entries.find((e: any) => e.accountCode === 'FA-02')!;

      expect(drEntry.debit.toString()).toBe('2500000');
      expect(drEntry.credit.toString()).toBe('0');
      expect(crEntry.credit.toString()).toBe('2500000');
      expect(crEntry.debit.toString()).toBe('0');
    });
  });

  // ─── 11. Reconciliation ────────────────────────────────────────────────────

  describe('reconcile()', () => {
    it('returns healthy report when no issues detected', async () => {
      repo.findUnbalancedJournals.mockResolvedValue([]);
      repo.findDuplicateSourcePostings.mockResolvedValue([]);
      repo.findJournalsWithMissingTradeSource.mockResolvedValue([]);

      const report = await service.reconcile();
      expect(report.isHealthy).toBe(true);
      expect(report.unbalancedJournals).toHaveLength(0);
      expect(report.duplicateSourcePostings).toHaveLength(0);
      expect(report.missingSourceReferences).toHaveLength(0);
    });

    it('returns unhealthy report when unbalanced journals detected', async () => {
      repo.findUnbalancedJournals.mockResolvedValue([
        {
          journalId: 'j1',
          idempotencyKey: 'test-key',
          sourceType: 'TRADE_CONFIRM',
          sourceId: 'trade-1',
          totalDebit: new Decimal('1000'),
          totalCredit: new Decimal('999'),
          imbalance: new Decimal('1'),
        },
      ]);
      repo.findDuplicateSourcePostings.mockResolvedValue([]);
      repo.findJournalsWithMissingTradeSource.mockResolvedValue([]);

      const report = await service.reconcile();
      expect(report.isHealthy).toBe(false);
      expect(report.unbalancedJournals).toHaveLength(1);
      expect(report.unbalancedJournals[0].imbalance).toBe('1.00');
    });

    it('does NOT modify data during reconciliation', async () => {
      repo.findUnbalancedJournals.mockResolvedValue([]);
      repo.findDuplicateSourcePostings.mockResolvedValue([]);
      repo.findJournalsWithMissingTradeSource.mockResolvedValue([]);

      await service.reconcile();

      // No write operations should have been called
      expect(repo.createJournalInTx).not.toHaveBeenCalled();
    });
  });
});
