import { PhysicalGoldPickupStatus } from './domain/constants/pickup-states';
import { PhysicalGoldPickupEntity } from './domain/entities/pickup.entity';
import {
  InsufficientPickupFeeCreditException,
  InsufficientPickupGoldException,
  InvalidPickupStateTransitionException,
  InvalidScheduledPickupDateException,
} from './domain/exceptions/pickup.exceptions';
import { PickupService } from './application/pickup.service';
import Decimal from 'decimal.js';

function makePickup(
  overrides: Partial<ConstructorParameters<typeof PhysicalGoldPickupEntity>[0]> = {},
): PhysicalGoldPickupEntity {
  return new PhysicalGoldPickupEntity({
    id: 'pkp-1',
    pickupNumber: 'PKP-000001',
    customerId: 'cust-1',
    storeId: 'store-1',
    weightGrams: '5.000000',
    purityRatio: '0.750000',
    status: PhysicalGoldPickupStatus.REQUESTED,
    customerNote: null,
    staffNote: null,
    cancelReason: null,
    cancelledByKind: null,
    scheduledPickupAt: null,
    requestedAt: new Date('2026-10-17T10:00:00.000Z'),
    preparingAt: null,
    readyAt: null,
    deliveredAt: null,
    cancelledAt: null,
    preparingById: null,
    readyById: null,
    deliveredById: null,
    cancelledById: null,
    createdAt: new Date('2026-10-17T10:00:00.000Z'),
    updatedAt: new Date('2026-10-17T10:00:00.000Z'),
    events: [],
    ...overrides,
  });
}

describe('PhysicalGoldPickupEntity transitions', () => {
  it('allows REQUESTED → PREPARING and CANCELLED', () => {
    const pickup = makePickup();
    expect(pickup.canTransitionTo(PhysicalGoldPickupStatus.PREPARING)).toBe(true);
    expect(pickup.canTransitionTo(PhysicalGoldPickupStatus.CANCELLED)).toBe(true);
    expect(pickup.canTransitionTo(PhysicalGoldPickupStatus.DELIVERED)).toBe(false);
  });

  it('allows READY → DELIVERED and blocks further cancel by entity after deliver', () => {
    const ready = makePickup({ status: PhysicalGoldPickupStatus.READY });
    expect(ready.canTransitionTo(PhysicalGoldPickupStatus.DELIVERED)).toBe(true);
    expect(ready.canTransitionTo(PhysicalGoldPickupStatus.CANCELLED)).toBe(true);
    const delivered = makePickup({ status: PhysicalGoldPickupStatus.DELIVERED });
    expect(delivered.canTransitionTo(PhysicalGoldPickupStatus.CANCELLED)).toBe(false);
  });
});

describe('PickupService.create', () => {
  const USER_ID = 'user-1';
  const CUSTOMER_ID = 'cust-1';

  function buildService(overrides: {
    availableGrams?: string;
    createResult?: PhysicalGoldPickupEntity;
  } = {}) {
    const available = new Decimal(overrides.availableGrams ?? '10.000000');
    const created = overrides.createResult ?? makePickup();

    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: CUSTOMER_ID,
          mobile: '09120000000',
          status: 'ACTIVE',
          accountStatus: 'ACTIVE',
          account: { id: 'acc-1', status: 'ACTIVE' },
        }),
      },
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 'store-1', name: 'Store', address: 'Tehran' }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    };
    const tx = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            status: 'TRADE_CREATED',
            purityRatio: { toString: () => '0.750000' },
            trade: { status: 'CONFIRMED' },
            items: [{ metadata: { side: 'BUY' } }],
          },
        ]),
      },
    };

    const accountRepo = {
      lockByCustomerId: jest.fn().mockResolvedValue(undefined),
      availableRialInTx: jest.fn().mockResolvedValue(new Decimal('0')),
      reserveCredit: jest.fn().mockResolvedValue(new Decimal('0')),
    };
    const activity = {
      sellableWeightGrams: jest.fn().mockResolvedValue(available),
    };
    const repo = {
      nextPickupNumber: jest.fn().mockResolvedValue('PKP-000001'),
      createInTx: jest.fn().mockResolvedValue(created),
      createChargeInTx: jest.fn().mockResolvedValue(undefined),
      setPreInvoiceInTx: jest.fn().mockResolvedValue(undefined),
    };
    const goldLedger = { postJournalInTx: jest.fn() };
    const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const feeService = {
      compute: jest.fn().mockResolvedValue({
        policy: null,
        mode: 'NONE',
        rateValue: new Decimal('0'),
        calculationBase: null,
        baseAmountRial: new Decimal('0'),
        amountRial: new Decimal('0'),
        goldPricePerGramRial: null,
      }),
    };
    const documentService = { generate: jest.fn().mockResolvedValue(null) };
    const financialLedger = { postJournalInTx: jest.fn() };

    const service = new PickupService(
      prisma as never,
      repo as never,
      activity as never,
      accountRepo as never,
      goldLedger as never,
      notifications as never,
      audit as never,
      feeService as never,
      documentService as never,
      financialLedger as never,
    );

    return {
      service,
      prisma,
      tx,
      accountRepo,
      activity,
      repo,
      goldLedger,
      notifications,
      audit,
      feeService,
      documentService,
      financialLedger,
    };
  }

  it('locks account, checks sellable weight, and creates REQUESTED pickup', async () => {
    const { service, prisma, accountRepo, activity, repo, audit, notifications } = buildService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({}));

    const result = await service.create(USER_ID, { weightGrams: '5.000000' });

    expect(accountRepo.lockByCustomerId).toHaveBeenCalled();
    expect(activity.sellableWeightGrams).toHaveBeenCalled();
    expect(repo.createInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        weightGrams: expect.any(Decimal),
        purityRatio: expect.any(Decimal),
        customerId: CUSTOMER_ID,
      }),
    );
    expect(repo.createInTx.mock.calls[0][1].purityRatio.toFixed(6)).toBe('0.750000');
    expect(result.status).toBe(PhysicalGoldPickupStatus.REQUESTED);
    expect(audit.log).toHaveBeenCalled();
    expect(notifications.dispatch).toHaveBeenCalled();
  });

  it('rejects when requested weight exceeds sellable holding', async () => {
    const { service, prisma } = buildService({ availableGrams: '2.000000' });
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
      const tx = { order: { findMany: jest.fn().mockResolvedValue([]) } };
      return fn(tx);
    });

    await expect(service.create(USER_ID, { weightGrams: '5.000000' })).rejects.toBeInstanceOf(
      InsufficientPickupGoldException,
    );
  });

  it('reserves the conversion fee from the rial wallet and snapshots the charge', async () => {
    const { service, prisma, accountRepo, repo, feeService, documentService } = buildService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({}));
    feeService.compute.mockResolvedValue({
      policy: { id: 'pol-1', labelFa: 'کارمزد تبدیل به فیزیکی' },
      mode: 'FIXED',
      rateValue: new Decimal('50'),
      calculationBase: null,
      baseAmountRial: new Decimal('0'),
      amountRial: new Decimal('50'),
      goldPricePerGramRial: null,
      priceSnapshotId: null,
    });
    accountRepo.availableRialInTx.mockResolvedValue(new Decimal('100'));
    accountRepo.reserveCredit.mockResolvedValue(new Decimal('50'));
    documentService.generate.mockResolvedValue({
      key: 'pickups/PKP-000001/pre-invoice.json',
      mimeType: 'application/json',
      generatedAt: new Date(),
    });

    await service.create(USER_ID, { weightGrams: '5.000000' });

    expect(accountRepo.reserveCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: CUSTOMER_ID,
        amount: new Decimal('50'),
        sourceType: 'PICKUP',
        sourceId: 'pkp-1',
      }),
    );
    expect(repo.createChargeInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'RESERVED',
        amountRial: new Decimal('50'),
        policyId: 'pol-1',
      }),
    );
    expect(repo.setPreInvoiceInTx).toHaveBeenCalled();
  });

  it('rejects pickup when the rial wallet cannot cover the conversion fee', async () => {
    const { service, prisma, accountRepo, feeService } = buildService();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => fn({}));
    feeService.compute.mockResolvedValue({
      policy: { id: 'pol-1', labelFa: 'کارمزد تبدیل به فیزیکی' },
      mode: 'FIXED',
      rateValue: new Decimal('200'),
      calculationBase: null,
      baseAmountRial: new Decimal('0'),
      amountRial: new Decimal('200'),
      goldPricePerGramRial: null,
      priceSnapshotId: null,
    });
    accountRepo.availableRialInTx.mockResolvedValue(new Decimal('100'));

    await expect(service.create(USER_ID, { weightGrams: '5.000000' })).rejects.toBeInstanceOf(
      InsufficientPickupFeeCreditException,
    );
    expect(accountRepo.reserveCredit).not.toHaveBeenCalled();
  });
});

describe('PickupService.cancelMine', () => {
  it('rejects customer cancel after PREPARING has started', async () => {
    const preparing = makePickup({ status: PhysicalGoldPickupStatus.PREPARING });
    const prisma = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cust-1',
          mobile: '09120000000',
          status: 'ACTIVE',
          accountStatus: 'ACTIVE',
          account: { id: 'acc-1', status: 'ACTIVE' },
        }),
      },
    };
    const repo = {
      findByIdForCustomer: jest.fn().mockResolvedValue(preparing),
      transitionInTx: jest.fn(),
    };
    const service = new PickupService(
      prisma as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { dispatch: jest.fn() } as never,
      { log: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.cancelMine('user-1', 'pkp-1', { reason: 'منصرف شدم' }),
    ).rejects.toBeInstanceOf(InvalidPickupStateTransitionException);
    expect(repo.transitionInTx).not.toHaveBeenCalled();
  });
});

describe('PickupService.markPreparing', () => {
  it('requires a non-past scheduled pickup date and stores it', async () => {
    const requested = makePickup();
    const preparing = makePickup({
      status: PhysicalGoldPickupStatus.PREPARING,
      preparingAt: new Date(),
      preparingById: 'staff-1',
      scheduledPickupAt: new Date('2099-01-15T00:00:00.000Z'),
    });

    const repo = {
      findById: jest.fn().mockResolvedValue(requested),
      transitionInTx: jest.fn().mockResolvedValue(preparing),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new PickupService(
      {} as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      { dispatch: jest.fn() } as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.markPreparing('pkp-1', 'staff-1', {
      scheduledPickupAt: '2099-01-15',
    });
    expect(result.status).toBe(PhysicalGoldPickupStatus.PREPARING);
    expect(repo.transitionInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        toStatus: PhysicalGoldPickupStatus.PREPARING,
        scheduledPickupAt: expect.any(Date),
      }),
    );

    await expect(
      service.markPreparing('pkp-1', 'staff-1', { scheduledPickupAt: '2000-01-01' }),
    ).rejects.toBeInstanceOf(InvalidScheduledPickupDateException);
  });
});

describe('PickupService.markDelivered', () => {
  it('posts GA-02 OUT and rejects invalid status', async () => {
    const ready = makePickup({ status: PhysicalGoldPickupStatus.READY });
    const delivered = makePickup({
      status: PhysicalGoldPickupStatus.DELIVERED,
      deliveredAt: new Date(),
      deliveredById: 'staff-1',
    });

    const repo = {
      findById: jest.fn().mockResolvedValue(ready),
      transitionInTx: jest.fn().mockResolvedValue(delivered),
    };
    const goldLedger = {
      postJournalInTx: jest.fn().mockResolvedValue({ wasAlreadyPosted: false }),
    };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      customer: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', mobile: '09120000000' }),
      },
    };
    const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const documentService = { generate: jest.fn().mockResolvedValue(null) };

    const service = new PickupService(
      prisma as never,
      repo as never,
      {} as never,
      {} as never,
      goldLedger as never,
      notifications as never,
      audit as never,
      {} as never,
      documentService as never,
      { postJournalInTx: jest.fn() } as never,
    );

    const result = await service.markDelivered('pkp-1', 'staff-1', {});
    expect(result.status).toBe(PhysicalGoldPickupStatus.DELIVERED);
    expect(goldLedger.postJournalInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceType: 'PICKUP_DELIVER',
        entries: [
          expect.objectContaining({
            accountCode: 'GA-02',
            direction: 'OUT',
          }),
        ],
      }),
    );

    repo.findById.mockResolvedValue(makePickup({ status: PhysicalGoldPickupStatus.REQUESTED }));
    await expect(service.markDelivered('pkp-1', 'staff-1', {})).rejects.toBeInstanceOf(
      InvalidPickupStateTransitionException,
    );
  });

  it('settles the reserved fee: consumes credit and posts FA-02/FA-16', async () => {
    const ready = makePickup({
      status: PhysicalGoldPickupStatus.READY,
      charge: {
        id: 'chg-1',
        code: 'PICKUP_CONVERSION_FEE',
        labelFa: 'کارمزد تبدیل به فیزیکی',
        mode: 'FIXED',
        rateValue: new Decimal('50'),
        calculationBase: null,
        baseAmountRial: new Decimal('0'),
        amountRial: new Decimal('50'),
        goldPricePerGramRial: null,
        policyId: 'pol-1',
        status: 'RESERVED',
        walletAvailableAfterRial: new Decimal('50'),
        reservedAt: new Date(),
        settledAt: null,
        releasedAt: null,
      },
    });
    const delivered = makePickup({
      status: PhysicalGoldPickupStatus.DELIVERED,
      deliveredAt: new Date(),
      deliveredById: 'staff-1',
    });

    const repo = {
      findById: jest.fn().mockResolvedValue(ready),
      transitionInTx: jest.fn().mockResolvedValue(delivered),
      updateChargeInTx: jest.fn().mockResolvedValue(undefined),
      setInvoiceInTx: jest.fn().mockResolvedValue(undefined),
    };
    const accountRepo = { consumeCredit: jest.fn().mockResolvedValue(undefined) };
    const goldLedger = { postJournalInTx: jest.fn().mockResolvedValue({ wasAlreadyPosted: false }) };
    const financialLedger = { postJournalInTx: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      customer: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', mobile: '09120000000' }),
      },
    };
    const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const documentService = { generate: jest.fn().mockResolvedValue(null) };

    const service = new PickupService(
      prisma as never,
      repo as never,
      {} as never,
      accountRepo as never,
      goldLedger as never,
      notifications as never,
      audit as never,
      {} as never,
      documentService as never,
      financialLedger as never,
    );

    await service.markDelivered('pkp-1', 'staff-1', {});

    expect(accountRepo.consumeCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        amount: new Decimal('50'),
        sourceType: 'PICKUP',
        sourceId: 'pkp-1',
      }),
    );
    expect(financialLedger.postJournalInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        idempotencyKey: 'PICKUP_FEE_pkp-1',
        sourceType: 'PICKUP_FEE',
        entries: [
          { accountCode: 'FA-02', debit: new Decimal('50'), credit: new Decimal('0') },
          { accountCode: 'FA-16', debit: new Decimal('0'), credit: new Decimal('50') },
        ],
      }),
    );
    expect(repo.updateChargeInTx).toHaveBeenCalledWith(
      expect.anything(),
      'pkp-1',
      expect.objectContaining({ status: 'SETTLED' }),
    );
  });
});

describe('PickupService.cancelStaff', () => {
  it('releases the reserved conversion fee back to the wallet', async () => {
    const requested = makePickup({
      charge: {
        id: 'chg-1',
        code: 'PICKUP_CONVERSION_FEE',
        labelFa: 'کارمزد تبدیل به فیزیکی',
        mode: 'FIXED',
        rateValue: new Decimal('50'),
        calculationBase: null,
        baseAmountRial: new Decimal('0'),
        amountRial: new Decimal('50'),
        goldPricePerGramRial: null,
        policyId: 'pol-1',
        status: 'RESERVED',
        walletAvailableAfterRial: new Decimal('50'),
        reservedAt: new Date(),
        settledAt: null,
        releasedAt: null,
      },
    });
    const cancelled = makePickup({
      status: PhysicalGoldPickupStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: 'staff-1',
      cancelledByKind: 'STAFF',
    });

    const repo = {
      findById: jest.fn().mockResolvedValue(requested),
      transitionInTx: jest.fn().mockResolvedValue(cancelled),
      updateChargeInTx: jest.fn().mockResolvedValue(undefined),
    };
    const accountRepo = { releaseCredit: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
      customer: {
        findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', mobile: '09120000000' }),
      },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const service = new PickupService(
      prisma as never,
      repo as never,
      {} as never,
      accountRepo as never,
      {} as never,
      notifications as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.cancelStaff('pkp-1', 'staff-1', { reason: 'انصراف مشتری' });

    expect(accountRepo.releaseCredit).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        amount: new Decimal('50'),
        sourceType: 'PICKUP',
        sourceId: 'pkp-1',
      }),
    );
    expect(repo.updateChargeInTx).toHaveBeenCalledWith(
      expect.anything(),
      'pkp-1',
      expect.objectContaining({ status: 'RELEASED' }),
    );
  });
});
