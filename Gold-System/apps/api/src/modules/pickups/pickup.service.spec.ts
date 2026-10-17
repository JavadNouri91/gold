import { PhysicalGoldPickupStatus } from './domain/constants/pickup-states';
import { PhysicalGoldPickupEntity } from './domain/entities/pickup.entity';
import {
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

    const accountRepo = { lockByCustomerId: jest.fn().mockResolvedValue(undefined) };
    const activity = {
      sellableWeightGrams: jest.fn().mockResolvedValue(available),
    };
    const repo = {
      nextPickupNumber: jest.fn().mockResolvedValue('PKP-000001'),
      createInTx: jest.fn().mockResolvedValue(created),
    };
    const goldLedger = { postJournalInTx: jest.fn() };
    const notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new PickupService(
      prisma as never,
      repo as never,
      activity as never,
      accountRepo as never,
      goldLedger as never,
      notifications as never,
      audit as never,
    );

    return { service, prisma, tx, accountRepo, activity, repo, goldLedger, notifications, audit };
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

    const service = new PickupService(
      prisma as never,
      repo as never,
      {} as never,
      {} as never,
      goldLedger as never,
      notifications as never,
      audit as never,
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
});
