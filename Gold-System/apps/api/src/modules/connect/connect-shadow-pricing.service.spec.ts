import Decimal from 'decimal.js';
import { ConnectShadowPricingService } from './application/connect-shadow-pricing.service';

const baseMapping = () => ({
  id: 'mapping-1',
  updatedAt: new Date(),
  internalAssetType: 'INTERNAL_GOLD_WEIGHT',
  internalGoldPurity: new Decimal('0.750'),
  externalQuantityUnit: 'gram',
  externalPriceCurrency: 'IRR',
  priceUnitBasis: 'per-gram',
  conversionFactor: new Decimal('1'),
  connectBuySide: 'INTERNAL_BUY',
  connectSellSide: 'INTERNAL_SELL',
  isVerified: true,
});

describe('ConnectShadowPricingService', () => {
  let prisma: any;
  let audit: any;
  let snapshots: any;
  let pricingEngine: any;
  let service: ConnectShadowPricingService;
  let product: any;
  let settings: any;

  beforeEach(() => {
    const now = new Date();
    product = {
      id: 'catalog-1',
      externalProductId: 'connect-18k-1',
      title: 'آیتم آزمایشی',
      validationStatus: 'VALID',
      presenceStatus: 'SEEN',
      isActive: true,
      isBuyActive: true,
      isSellActive: true,
      buyPrice: new Decimal('123456.12345678'),
      sellPrice: new Decimal('123500.12345678'),
      lastFetchedAt: now,
      lastValidAt: now,
      mapping: {
        id: 'mapping-1',
        updatedAt: now,
        internalAssetType: 'INTERNAL_GOLD_WEIGHT',
        internalGoldPurity: new Decimal('0.750'),
        externalQuantityUnit: 'gram',
        externalPriceCurrency: 'IRR',
        priceUnitBasis: 'per-gram',
        conversionFactor: new Decimal('1'),
        connectBuySide: 'INTERNAL_BUY',
        connectSellSide: 'INTERNAL_SELL',
        isVerified: true,
      },
    };
    settings = {
      id: 'global',
      shadowReferenceProductId: product.id,
      shadowReferenceMappingId: product.mapping.id,
      shadowReferenceMappingUpdatedAt: product.mapping.updatedAt,
      shadowReferencePriceField: 'buy_price',
      shadowPriceMaxAgeSeconds: 300,
    };
    prisma = {
      connectIntegrationSettings: {
        findUnique: jest.fn().mockImplementation(async () => settings),
        update: jest.fn().mockImplementation(async ({ data }: any) => {
          settings = { ...settings, ...data };
          return settings;
        }),
      },
      connectProduct: { findFirst: jest.fn().mockResolvedValue(product), findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    snapshots = {
      findLatestValid: jest.fn().mockResolvedValue({
        normalizedValue: new Decimal('123400.000000'),
        unit: 'IRR_PER_GRAM',
        currency: 'IRR',
        purityReference: 'MOCK',
        capturedAt: now,
      }),
      create: jest.fn(),
    };
    pricingEngine = { calculatePreview: jest.fn().mockResolvedValue({ finalPrice: new Decimal('123.45'), isComplete: false, blockedSteps: ['PROFIT', 'TAX'] }) };
    service = new ConnectShadowPricingService(prisma, audit, snapshots, pricingEngine);
  });

  it('returns a traceable candidate and exact Decimal display while staying NOT_READY for the unresolved contract', async () => {
    const result = await service.getPreview();
    expect(result).toMatchObject({
      mode: 'SHADOW_CANDIDATE',
      status: 'NOT_READY',
      candidate: {
        id: 'catalog-1',
        mapping: { id: 'mapping-1', selectedPriceField: 'buy_price', selectedPriceDirection: 'BUY_FROM_SUPPLIER' },
      },
      connectPrice: { value: '123456.12345678', field: 'buy_price', fresh: true, live: true, supplierDirection: 'BUY_FROM_SUPPLIER' },
      currentReference: { value: '123400.000000', unit: 'IRR_PER_GRAM' },
      difference: null,
      operationalPricingEnabled: false,
    });
    expect(result.reasons).toContain('PRICE_CONTRACT_UNRESOLVED');
    expect(snapshots.create).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', { validationStatus: 'INVALID' }, 'PRODUCT_NOT_VALID'],
    ['partial', { validationStatus: 'PARTIAL' }, 'PRODUCT_NOT_VALID'],
    ['inactive', { isActive: false }, 'PRODUCT_INACTIVE'],
    ['not seen', { presenceStatus: 'NOT_SEEN' }, 'PRODUCT_NOT_SEEN'],
    ['draft mapping', { mapping: { ...baseMapping(), isVerified: false } }, 'MAPPING_NOT_VERIFIED'],
    ['non 18k mapping', { mapping: { ...baseMapping(), internalGoldPurity: new Decimal('0.916') } }, 'NOT_VERIFIED_18K_MAPPING'],
    ['missing units', { mapping: { ...baseMapping(), externalQuantityUnit: null } }, 'MAPPING_UNIT_CURRENCY_OR_BASIS_MISSING'],
    ['missing direction', { mapping: { ...baseMapping(), connectBuySide: null } }, 'PRICE_DIRECTION_UNCONFIRMED'],
    ['changed mapping version', { mapping: { ...baseMapping(), updatedAt: new Date(Date.now() + 1000) } }, 'MAPPING_VERSION_CHANGED'],
    ['stale price', { lastValidAt: new Date(Date.now() - 600_000) }, 'CONNECT_PRICE_STALE'],
  ])('marks %s as NOT_READY', async (_name, overrides, expectedReason) => {
    prisma.connectProduct.findFirst.mockResolvedValue({ ...product, ...overrides });
    const result = await service.getPreview();
    expect(result.status).toBe('NOT_READY');
    expect(result.reasons).toContain(expectedReason);
    expect(result.difference).toBeNull();
    if (['inactive', 'not seen'].includes(_name)) expect(result.connectPrice).toMatchObject({ value: null, live: false, historicalValue: '123456.12345678' });
  });

  it('selects only an explicitly verified current weighted 18K candidate and audits the pinned version', async () => {
    const result = await service.selectCandidate('catalog-1', 'sell_price', 'manager');
    expect(prisma.connectIntegrationSettings.update).toHaveBeenCalledWith({
      where: { id: 'global' },
      data: expect.objectContaining({
        shadowReferenceProductId: 'catalog-1',
        shadowReferenceMappingId: 'mapping-1',
        shadowReferencePriceField: 'sell_price',
      }),
    });
    expect(result.connectPrice).toMatchObject({ field: 'sell_price', value: '123500.12345678', supplierDirection: 'SELL_TO_SUPPLIER' });
    expect(result.candidate?.mapping).toMatchObject({ selectedPriceDirection: 'SELL_TO_SUPPLIER', mappedInternalSide: 'INTERNAL_SELL' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONNECT_SHADOW_REFERENCE_SELECTED' }));
  });

  it('rejects unverified mapping candidates without writing selection', async () => {
    prisma.connectProduct.findFirst.mockResolvedValue({
      ...product,
      mapping: { ...product.mapping, isVerified: false },
    });
    await expect(service.selectCandidate('catalog-1', 'buy_price', 'manager')).rejects.toThrow('فقط محصول معتبر');
    expect(prisma.connectIntegrationSettings.update).not.toHaveBeenCalled();
  });

  it('bounds and audits the configurable maximum age', async () => {
    const result = await service.setMaxAge(600, 'manager');
    expect(prisma.connectIntegrationSettings.update).toHaveBeenCalledWith({
      where: { id: 'global' },
      data: { shadowPriceMaxAgeSeconds: 600 },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONNECT_SHADOW_PRICE_MAX_AGE_CHANGED' }));
    expect(result.maxAgeSeconds).toBe(600);
    await expect(service.setMaxAge(10, 'manager')).rejects.toThrow('بین ۳۰ تا ۳۶۰۰');
  });

  it('converts supplier buy and sell prices from Toman per mesghal to Toman and Rial per gram without changing raw values', async () => {
    const cashProduct = {
      ...product,
      isBuyActive: true,
      isSellActive: false,
      buyPrice: new Decimal('43318.00000000'),
      sellPrice: new Decimal('86636.00000000'),
      mapping: {
        ...product.mapping,
        cashPriceCategory: 'CASH_SPOT',
        externalPriceCurrency: 'TOMAN',
        externalQuantityUnit: 'MESGHAL',
        priceUnitBasis: 'PER_MESGHAL',
        conversionFactor: new Decimal('4.3318'),
        isVerified: true,
      },
    };
    settings.shadowCashReferences = { CASH_SPOT: { productId: cashProduct.id, mappingId: cashProduct.mapping.id, mappingUpdatedAt: cashProduct.mapping.updatedAt.toISOString() } };
    prisma.connectProduct.findMany.mockResolvedValue([cashProduct]);
    const result = await service.getCashPreview();
    const spot = result.categories[0];
    expect(spot.sides.buy).toMatchObject({
      supplierDirection: 'BUY_FROM_SUPPLIER', rawMesghalPriceToman: '43318',
      gram18PriceToman: '10000', gram18PriceRial: '100000', conversionReady: true,
    });
    expect(spot.sides.sell).toMatchObject({
      supplierDirection: 'SELL_TO_SUPPLIER', rawMesghalPriceToman: '86636',
      gram18PriceToman: '20000', gram18PriceRial: '200000', providerActive: false,
      providerActivityMeaning: 'UNCONFIRMED', conversionReady: true,
    });
    expect(spot.sides.sell.reasons).not.toContain('SELL_DISABLED_BY_PROVIDER');
    expect(spot.sides.buy).toMatchObject({
      conversionReady: true,
      comparisonReady: false,
      operationalReady: false,
      pricingEnginePreview: { price: '123.45', isComplete: false },
    });
    expect(spot.conversionReady).toBe(true);
    expect(spot.comparisonReady).toBe(false);
    expect(spot.operationalReady).toBe(false);
    expect(spot.sides.buy.comparison).toBeNull();
    expect(spot.reasons).toContain('INTERNAL_PRICE_CONTRACT_UNCONFIRMED');
    expect(pricingEngine.calculatePreview).toHaveBeenCalledTimes(2);
    expect(pricingEngine.calculatePreview).toHaveBeenCalledWith(expect.anything(), new Decimal('100000'), expect.stringContaining(':buy_price:'));
    expect(snapshots.create).not.toHaveBeenCalled();
  });

  it('does not block shadow selection based on supplier-side flags whose meaning is unconfirmed', async () => {
    product.isBuyActive = false;
    const result = await service.selectCandidate('catalog-1', 'buy_price', 'manager');
    expect(prisma.connectIntegrationSettings.update).toHaveBeenCalled();
    expect(result.connectPrice).toMatchObject({ supplierDirection: 'BUY_FROM_SUPPLIER', live: true });
  });

  it('uses Decimal precision for both conversions and does not convert a Connect price twice', async () => {
    const raw = new Decimal('123.45678901');
    const cashProduct = {
      ...product, buyPrice: raw, mapping: {
        ...product.mapping, cashPriceCategory: 'CASH_TOMORROW', externalPriceCurrency: 'TOMAN',
        externalQuantityUnit: 'MESGHAL', priceUnitBasis: 'PER_MESGHAL', conversionFactor: new Decimal('4.3318'), isVerified: true,
      },
    };
    settings.shadowCashReferences = { CASH_TOMORROW: { productId: cashProduct.id, mappingId: cashProduct.mapping.id, mappingUpdatedAt: cashProduct.mapping.updatedAt.toISOString() } };
    prisma.connectProduct.findMany.mockResolvedValue([cashProduct]);
    const result = await service.getCashPreview();
    const buy = result.categories[1].sides.buy;
    expect(buy.rawMesghalPriceToman).toBe(raw.toString());
    expect(new Decimal(buy.gram18PriceToman).eq(raw.div('4.3318'))).toBe(true);
    expect(new Decimal(buy.gram18PriceRial).eq(raw.times(10).div('4.3318'))).toBe(true);
    expect(new Decimal(buy.gram18PriceRial).eq(new Decimal(buy.gram18PriceToman).times(10))).toBe(true);
  });

  it('does not interpret the existing IRR mapping as a Toman Connect quote', async () => {
    const cashProduct = { ...product, mapping: { ...product.mapping, cashPriceCategory: 'CASH_SPOT', externalQuantityUnit: 'MESGHAL', priceUnitBasis: 'PER_MESGHAL', conversionFactor: new Decimal('4.3318'), externalPriceCurrency: 'IRR', isVerified: true } };
    settings.shadowCashReferences = { CASH_SPOT: { productId: cashProduct.id, mappingId: cashProduct.mapping.id, mappingUpdatedAt: cashProduct.mapping.updatedAt.toISOString() } };
    prisma.connectProduct.findMany.mockResolvedValue([cashProduct]);
    const result = await service.getCashPreview();
    expect(result.categories[0].sides.buy.rawMesghalPriceToman).toBe('123456.12345678');
    expect(result.categories[0].sides.buy.gram18PriceToman).toBeNull();
    expect(result.categories[0].reasons).toContain('PRICE_CONTRACT_UNCONFIRMED');
  });

  it.each([
    ['disabled', { isActive: false }, 'DISABLED_BY_PROVIDER'],
    ['not seen', { presenceStatus: 'NOT_SEEN' }, 'NOT_SEEN'],
    ['invalid', { validationStatus: 'INVALID' }, 'INVALID'],
  ])('keeps the selected %s cash product unavailable with no fallback', async (_name, overrides, availability) => {
    const cashProduct = {
      ...product, ...overrides, isBuyActive: true, isSellActive: true,
      mapping: { ...product.mapping, cashPriceCategory: 'CASH_SPOT', externalQuantityUnit: 'MESGHAL', priceUnitBasis: 'PER_MESGHAL', conversionFactor: new Decimal('4.3318'), isVerified: true },
    };
    settings.shadowCashReferences = { CASH_SPOT: { productId: cashProduct.id, mappingId: cashProduct.mapping.id, mappingUpdatedAt: cashProduct.mapping.updatedAt.toISOString() } };
    prisma.connectProduct.findMany.mockResolvedValue([cashProduct]);
    const result = await service.getCashPreview();
    expect(result.categories[0].product!.availability).toBe(availability);
    expect(result.categories[0].selectedProductId).toBe(cashProduct.id);
    expect(result.categories[0].historicalOnly).toBe(true);
    expect(result.categories[0].sides.buy.gram18PriceToman).toBeNull();
    expect(result.categories[0].sides.buy.gram18PriceRial).toBeNull();
    expect(pricingEngine.calculatePreview).not.toHaveBeenCalled();
  });

  it('allows a manager to save a Draft cash reference and audits the pinned mapping version', async () => {
    const draft = { ...product, mapping: { ...product.mapping, cashPriceCategory: 'CASH_TOMORROW', isVerified: false } };
    prisma.connectProduct.findFirst.mockResolvedValue(draft);
    await service.selectCashReference('CASH_TOMORROW', draft.id, 'manager');
    expect(prisma.connectIntegrationSettings.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shadowCashReferences: expect.objectContaining({ CASH_TOMORROW: expect.objectContaining({ productId: draft.id, mappingId: draft.mapping.id }) }) }),
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONNECT_CASH_SHADOW_REFERENCE_SELECTED' }));
  });
});
