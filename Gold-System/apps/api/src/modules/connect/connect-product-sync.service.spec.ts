import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { ConnectProductSyncService } from './application/connect-product-sync.service';
import { encryptConnectSecret } from '../../common/crypto/secret-box';

describe('ConnectProductSyncService', () => {
  const product = (overrides: Record<string, unknown> = {}) => ({
    id: 'external-1',
    title: 'سکه تمام',
    buy_price: 100,
    sell_price: 101,
    is_active: true,
    is_buy_active: true,
    is_sell_active: true,
    ...overrides,
  });
  let prisma: any;
  let audit: any;
  let http: any;
  let service: ConnectProductSyncService;
  let tx: any;
  let leaseToken: string | null;
  let leaseExpiresAt: Date | null;

  beforeEach(() => {
    process.env.CONNECT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    leaseToken = null;
    leaseExpiresAt = null;
    tx = {
      $queryRaw: jest.fn(async () => [
        {
          catalog_sync_lock_token: leaseToken,
          catalog_sync_lock_expires_at: leaseExpiresAt,
        },
      ]),
      connectProduct: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'internal-1', ...data })),
        update: jest.fn().mockImplementation(async ({ data }) => data),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      connectProductSync: { update: jest.fn().mockResolvedValue(undefined) },
    };
    const settings = {
      id: 'global',
      isEnabled: true,
      accessKeyEncrypted: encryptConnectSecret('key'),
      accessSecretEncrypted: encryptConnectSecret('secret'),
      httpBaseUrl: 'https://connect.tala-app.ir',
    };
    prisma = {
      connectIntegrationSettings: {
        findUnique: jest.fn().mockResolvedValue(settings),
        updateMany: jest.fn(async ({ where, data }) => {
          if (data.catalogSyncLockToken) {
            leaseToken = data.catalogSyncLockToken;
            leaseExpiresAt = data.catalogSyncLockExpiresAt;
            return { count: 1 };
          }
          if (where.catalogSyncLockToken === leaseToken) {
            leaseToken = null;
            leaseExpiresAt = null;
            return { count: 1 };
          }
          return { count: 0 };
        }),
      },
      connectProductSync: {
        create: jest.fn().mockResolvedValue({ id: 'sync-1' }),
        update: jest.fn().mockResolvedValue(undefined),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      connectProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 'internal-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      connectProductMapping: {
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest
          .fn()
          .mockImplementation(async ({ create }) => ({ id: 'mapping-1', ...create })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ id: 'mapping-1', ...data })),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    http = { fetchProductsForSync: jest.fn().mockResolvedValue([product()]) };
    service = new ConnectProductSyncService(prisma, audit, http);
  });

  afterEach(() => {
    delete process.env.CONNECT_ENCRYPTION_KEY;
  });

  it('bounds catalog list reads to the UI/API page-size ceiling', async () => {
    await service.list({ page: 1, pageSize: 10_000 });
    expect(prisma.connectProduct.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 100 }));
  });

  it('stores valid catalog rows in an isolated Connect transaction with sanitized audit', async () => {
    const result = await service.sync('manager', '127.0.0.1');
    expect(http.fetchProductsForSync).toHaveBeenCalledWith(
      'https://connect.tala-app.ir',
      'key',
      'secret',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.connectProduct.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalProductId: 'external-1',
          validationStatus: 'VALID',
          presenceStatus: 'SEEN',
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'SUCCESS',
      totalCount: 1,
      validCount: 1,
      invalidCount: 0,
      newCount: 1,
    });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('buyPrice');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('sellPrice');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('secret');
  });

  it('is idempotent across repeated catalog syncs for the same external product', async () => {
    tx.connectProduct.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'internal-1',
        externalProductId: 'external-1',
        title: 'سکه تمام',
        buyPrice: '100',
        sellPrice: '101',
        isActive: true,
        isBuyActive: true,
        isSellActive: true,
      },
    ]);
    const first = await service.sync('manager');
    const second = await service.sync('manager');
    expect(first.newCount).toBe(1);
    expect(second.newCount).toBe(0);
    expect(second.updatedCount).toBe(1);
    expect(tx.connectProduct.create).toHaveBeenCalledTimes(1);
    expect(tx.connectProduct.update).toHaveBeenCalledTimes(1);
  });

  it('keeps the last valid side price when a new price is invalid and reports partial data', async () => {
    tx.connectProduct.findMany.mockResolvedValue([
      {
        id: 'internal-1',
        externalProductId: 'external-1',
        title: 'سکه تمام',
        buyPrice: '90',
        sellPrice: '91',
        isActive: true,
        isBuyActive: true,
        isSellActive: true,
      },
    ]);
    http.fetchProductsForSync.mockResolvedValue([product({ sell_price: -2 })]);
    const result = await service.sync('manager');
    const update = tx.connectProduct.update.mock.calls[0][0].data;
    expect(update.buyPrice.toString()).toBe('100');
    expect(update).not.toHaveProperty('sellPrice');
    expect(update.validationStatus).toBe('PARTIAL');
    expect(update.lastValidationErrors).toEqual([
      expect.objectContaining({ field: 'sell_price', receivedType: 'number', index: 0 }),
    ]);
    expect(result).toMatchObject({
      status: 'WARNING',
      validCount: 0,
      invalidCount: 1,
      updatedCount: 1,
    });
  });

  it('keeps the 18-valid/3-invalid HTTP contract consistent through Decimal persistence and catalog reads', async () => {
    const products = Array.from({ length: 21 }, (_, index) =>
      product({
        id: `external-${index}`,
        buy_price: 1000.125 + index,
        sell_price: 1001.875 + index,
      }),
    );
    // Synthetic invalid values exercise the contract only; they are not real Connect prices.
    products[8] = { ...products[8], sell_price: -1 };
    products[9] = { ...products[9], sell_price: -2 };
    products[10] = { ...products[10], sell_price: -3 };
    http.fetchProductsForSync.mockResolvedValue(products);

    const syncResult = await service.sync('manager');
    const persistedRows = tx.connectProduct.create.mock.calls.map((call: any, index: number) => ({
      id: `internal-${index}`,
      ...call[0].data,
      mapping: null,
    }));
    const persistedValid = persistedRows.filter((row: any) => row.validationStatus === 'VALID');
    const persistedPartial = persistedRows.filter((row: any) => row.validationStatus === 'PARTIAL');

    expect(syncResult).toMatchObject({ totalCount: 21, validCount: 18, invalidCount: 3 });
    expect(persistedValid).toHaveLength(18);
    expect(persistedPartial).toHaveLength(3);
    expect(persistedRows[0].buyPrice).toBeInstanceOf(Prisma.Decimal);
    expect(persistedRows[0].buyPrice.toString()).toBe('1000.125');
    expect(persistedRows[8]).not.toHaveProperty('sellPrice');
    expect(persistedRows[8].lastValidationErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ reason: 'NEGATIVE_PRICE' })]),
    );

    prisma.connectProduct.findMany.mockResolvedValue(persistedRows);
    prisma.connectProduct.count.mockResolvedValue(21);
    const page = await service.list();
    expect(page.total).toBe(21);
    expect(page.items.filter((item) => item.validationStatus === 'VALID')).toHaveLength(18);
    expect(page.items.filter((item) => item.validationStatus === 'PARTIAL')).toHaveLength(3);
    expect(page.items[0].buyPrice).toBe('1000.125');

    prisma.connectProductSync.findFirst.mockResolvedValue({
      status: 'WARNING',
      totalCount: 21,
      validCount: 18,
      invalidCount: 3,
      newCount: 21,
      updatedCount: 0,
      notSeenCount: 0,
      errorCode: null,
      responseTimeMs: 20,
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-01T00:00:00.020Z'),
    });
    prisma.connectProduct.groupBy.mockResolvedValue([
      { validationStatus: 'VALID', isActive: true, _count: { _all: 18 } },
      { validationStatus: 'PARTIAL', isActive: true, _count: { _all: 3 } },
    ]);
    const status = await service.syncStatus();
    expect(status.latest).toMatchObject({ totalCount: 21, validCount: 18, invalidCount: 3 });
    expect(status.counts).toEqual([
      { validationStatus: 'VALID', isActive: true, count: 18 },
      { validationStatus: 'PARTIAL', isActive: true, count: 3 },
    ]);
  });

  it('does not change cached products when the HTTP fetch fails', async () => {
    http.fetchProductsForSync.mockRejectedValue(
      Object.assign(new Error('do not leak'), { code: 'AUTHENTICATION_FAILED' }),
    );
    await expect(service.sync('manager')).rejects.toThrow('همگام‌سازی محصولات انجام نشد');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.connectProductSync.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', errorCode: 'AUTHENTICATION_FAILED' }),
      }),
    );
    expect(tx.connectProduct.create).not.toHaveBeenCalled();
    expect(tx.connectProduct.update).not.toHaveBeenCalled();
    expect(tx.connectProduct.updateMany).not.toHaveBeenCalled();
  });

  it('retains products absent from the latest response and marks them NOT_SEEN', async () => {
    tx.connectProduct.findMany.mockResolvedValue([]);
    tx.connectProduct.updateMany.mockResolvedValue({ count: 3 });
    http.fetchProductsForSync.mockResolvedValue([]);
    const result = await service.sync('manager');
    expect(tx.connectProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ integrationSettingsId: 'global', presenceStatus: 'SEEN' }),
        data: { presenceStatus: 'NOT_SEEN' },
      }),
    );
    expect(tx.connectProduct).not.toHaveProperty('deleteMany');
    expect(result).toMatchObject({ status: 'SUCCESS', totalCount: 0, notSeenCount: 3 });
  });

  it('does not start a second external fetch while the integration sync lease is held', async () => {
    prisma.connectIntegrationSettings.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.sync('manager')).rejects.toThrow('همگام‌سازی دیگری');
    expect(prisma.connectProductSync.create).not.toHaveBeenCalled();
    expect(http.fetchProductsForSync).not.toHaveBeenCalled();
  });

  it('rejects a stale lease owner before any catalog rows are read or changed', async () => {
    tx.$queryRaw.mockImplementationOnce(async () => {
      leaseToken = 'newer-owner';
      leaseExpiresAt = new Date(Date.now() + 60_000);
      return [
        {
          catalog_sync_lock_token: leaseToken,
          catalog_sync_lock_expires_at: leaseExpiresAt,
        },
      ];
    });

    await expect(service.sync('manager')).rejects.toThrow('از مالکیت قفل خارج شده');
    expect(tx.connectProduct.findMany).not.toHaveBeenCalled();
    expect(tx.connectProduct.create).not.toHaveBeenCalled();
    expect(tx.connectProduct.update).not.toHaveBeenCalled();
    expect(tx.connectProduct.updateMany).not.toHaveBeenCalled();
    expect(leaseToken).toBe('newer-owner');
  });

  it('does not persist a product with an invalid external identifier', async () => {
    http.fetchProductsForSync.mockResolvedValue([product({ id: '' })]);
    const result = await service.sync('manager');
    expect(tx.connectProduct.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ totalCount: 1, invalidCount: 1, unpersistedInvalidIdCount: 1 });
  });

  it('stores mapping edits as disabled drafts and clears verification', async () => {
    prisma.connectProductMapping.findUnique.mockResolvedValue({
      id: 'mapping-1',
      isVerified: true,
      isEnabled: false,
    });
    const result = await service.saveMapping(
      'internal-1',
      { internalAssetType: 'INTERNAL_GOLD_WEIGHT', conversionFactor: '1' },
      'manager',
    );
    expect(prisma.connectProductMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          isEnabled: false,
          isVerified: false,
          verifiedAt: null,
          verifiedById: null,
        }),
      }),
    );
    expect(result.isEnabled).toBe(false);
    expect(result.isVerified).toBe(false);
  });

  it('verifies only a complete supported draft and keeps it disabled', async () => {
    const draft = {
      id: 'mapping-1',
      internalAssetType: 'INTERNAL_GOLD_WEIGHT',
      internalGoldPurity: new Prisma.Decimal('0.750000'),
      externalQuantityUnit: 'gram',
      externalPriceCurrency: 'UNCONFIRMED-CURRENCY',
      priceUnitBasis: 'per-gram',
      conversionFactor: new Prisma.Decimal('1'),
      connectBuySide: 'INTERNAL_BUY',
      connectSellSide: 'INTERNAL_SELL',
      isEnabled: false,
      isVerified: false,
    };
    prisma.connectProduct.findFirst.mockResolvedValue({
      id: 'internal-1',
      validationStatus: 'VALID',
      presenceStatus: 'SEEN',
      mapping: draft,
    });
    const result = await service.verifyMapping('internal-1', 'manager');
    expect(result).toMatchObject({ isVerified: true, isEnabled: false, verifiedById: 'manager' });
    expect(prisma.connectProductMapping.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isVerified: true,
          isEnabled: false,
          verifiedById: 'manager',
        }),
      }),
    );
  });

  it('does not verify unsupported mappings', async () => {
    prisma.connectProduct.findFirst.mockResolvedValue({
      id: 'internal-1',
      validationStatus: 'VALID',
      presenceStatus: 'SEEN',
      mapping: { id: 'mapping-1', internalAssetType: 'UNSUPPORTED' },
    });
    await expect(service.verifyMapping('internal-1', 'manager')).rejects.toThrow('مشخصات دارایی');
    expect(prisma.connectProductMapping.update).not.toHaveBeenCalled();
  });

  it('does not verify a mapping without independently confirmed price directions', async () => {
    prisma.connectProduct.findFirst.mockResolvedValue({
      id: 'internal-1',
      validationStatus: 'VALID',
      presenceStatus: 'SEEN',
      mapping: {
        id: 'mapping-1',
        internalAssetType: 'INTERNAL_GOLD_WEIGHT',
        internalGoldPurity: new Prisma.Decimal('0.750'),
        externalQuantityUnit: 'MESGHAL',
        externalPriceCurrency: 'TOMAN',
        priceUnitBasis: 'PER_MESGHAL',
        conversionFactor: new Prisma.Decimal('4.3318'),
        connectBuySide: null,
        connectSellSide: null,
      },
    });

    await expect(service.verifyMapping('internal-1', 'manager')).rejects.toThrow('جهت مستقل خرید و فروش');
    expect(prisma.connectProductMapping.update).not.toHaveBeenCalled();
  });
});
