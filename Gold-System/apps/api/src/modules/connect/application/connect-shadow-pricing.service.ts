import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { PriceSnapshotRepository } from '../../pricing/infrastructure/repositories/price-snapshot.repository';
import { PricingEngineService } from '../../pricing/application/pricing-engine.service';

export const MESGHAL_TO_GRAM_18 = new Decimal('4.3318');
export const CONNECT_CASH_CURRENCY = 'TOMAN';
export const TOMAN_TO_RIAL = new Decimal('10');
const SETTINGS_ID = 'global';
const DEFAULT_MAX_AGE_SECONDS = 300;
const MIN_MAX_AGE_SECONDS = 30;
const MAX_MAX_AGE_SECONDS = 3600;
const CATEGORIES = ['CASH_SPOT', 'CASH_TOMORROW', 'CASH_DAY_AFTER_TOMORROW'] as const;
type CashCategory = (typeof CATEGORIES)[number];
type ShadowPriceField = 'buy_price' | 'sell_price';
type DisplayMode = 'MESGHAL' | 'GRAM' | 'BOTH';
export type SupplierPriceDirection = 'BUY_FROM_SUPPLIER' | 'SELL_TO_SUPPLIER';

function supplierDirection(priceField: ShadowPriceField): SupplierPriceDirection {
  return priceField === 'buy_price' ? 'BUY_FROM_SUPPLIER' : 'SELL_TO_SUPPLIER';
}

@Injectable()
export class ConnectShadowPricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly snapshots: PriceSnapshotRepository,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  async selectCandidate(productId: string | null, priceField: ShadowPriceField | null, actorId: string, ipAddress?: string) {
    const settings = await this.settings();
    let selected: { productId: string; mappingId: string; mappingUpdatedAt: Date; priceField: ShadowPriceField } | null = null;
    if (productId !== null) {
      if (priceField !== 'buy_price' && priceField !== 'sell_price') throw new BadRequestException('جهت قیمت مرجع را مشخص کنید.');
      const product = await this.product(productId);
      const mapping = product.mapping;
      if (!isEligibleMapping(product, mapping) || !product.lastValidAt || !isFresh(product.lastValidAt, settings.shadowPriceMaxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS))
        throw new BadRequestException('فقط محصول معتبر و تازه با نگاشت تأییدشده‌ی طلای وزنی ۱۸ عیار قابل انتخاب است.');
      if (!(priceField === 'buy_price' ? mapping.connectBuySide : mapping.connectSellSide))
        throw new BadRequestException('جهت داخلی انتخاب‌شده در نگاشت تأیید نشده است.');
      selected = { productId, mappingId: mapping.id, mappingUpdatedAt: mapping.updatedAt, priceField };
    }
    const next = {
      shadowReferenceProductId: selected?.productId ?? null,
      shadowReferenceMappingId: selected?.mappingId ?? null,
      shadowReferenceMappingUpdatedAt: selected?.mappingUpdatedAt ?? null,
      shadowReferencePriceField: selected?.priceField ?? null,
    };
    await (this.prisma.connectIntegrationSettings as any).update({ where: { id: SETTINGS_ID }, data: next });
    await this.audit.log({ actorId, action: 'CONNECT_SHADOW_REFERENCE_SELECTED', entityType: 'ConnectIntegrationSettings', entityId: SETTINGS_ID, ipAddress,
      before: { productId: settings.shadowReferenceProductId ?? null, mappingId: settings.shadowReferenceMappingId ?? null, priceField: settings.shadowReferencePriceField ?? null },
      after: { ...next, operationalPricingEnabled: false } });
    return this.getPreview();
  }

  async selectCashReference(category: CashCategory, productId: string | null, actorId: string, ipAddress?: string) {
    if (!CATEGORIES.includes(category)) throw new BadRequestException('دسته‌ی قیمت نقد معتبر نیست.');
    const settings = await this.settings();
    const refs = safeRefs(settings.shadowCashReferences);
    const before = refs[category] ?? null;
    let next: any = null;
    if (productId) {
      const product = await this.product(productId);
      if ((product.mapping as any)?.cashPriceCategory !== category) throw new BadRequestException('دسته‌ی محصول با مرجع انتخابی یکسان نیست. ابتدا دسته را در نگاشت مدیر ثبت کنید.');
      // Draft references are allowed; pin mapping identity/version so later edits invalidate the preview.
      next = { productId, mappingId: product.mapping?.id ?? null, mappingUpdatedAt: product.mapping?.updatedAt?.toISOString() ?? null };
    }
    refs[category] = next;
    await (this.prisma.connectIntegrationSettings as any).update({ where: { id: SETTINGS_ID }, data: { shadowCashReferences: refs } });
    await this.audit.log({ actorId, action: 'CONNECT_CASH_SHADOW_REFERENCE_SELECTED', entityType: 'ConnectIntegrationSettings', entityId: SETTINGS_ID, ipAddress,
      before: { category, reference: before }, after: { category, reference: next, operationalPricingEnabled: false } });
    return this.getCashPreview();
  }

  async setDisplayMode(mode: DisplayMode, actorId: string, ipAddress?: string) {
    if (!['MESGHAL', 'GRAM', 'BOTH'].includes(mode)) throw new BadRequestException('حالت نمایش معتبر نیست.');
    const settings = await this.settings();
    const before = (settings as any).shadowDisplayMode ?? 'BOTH';
    await (this.prisma.connectIntegrationSettings as any).update({ where: { id: SETTINGS_ID }, data: { shadowDisplayMode: mode } });
    await this.audit.log({ actorId, action: 'CONNECT_SHADOW_DISPLAY_MODE_CHANGED', entityType: 'ConnectIntegrationSettings', entityId: SETTINGS_ID, ipAddress,
      before: { mode: before }, after: { mode, operationalPricingEnabled: false } });
    return this.getCashPreview();
  }

  async setMaxAge(maxAgeSeconds: number, actorId: string, ipAddress?: string) {
    if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds < MIN_MAX_AGE_SECONDS || maxAgeSeconds > MAX_MAX_AGE_SECONDS)
      throw new BadRequestException('حداکثر عمر قیمت باید بین ۳۰ تا ۳۶۰۰ ثانیه باشد.');
    const settings = await this.settings();
    const before = (settings as any).shadowPriceMaxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
    await (this.prisma.connectIntegrationSettings as any).update({ where: { id: SETTINGS_ID }, data: { shadowPriceMaxAgeSeconds: maxAgeSeconds } });
    await this.audit.log({ actorId, action: 'CONNECT_SHADOW_PRICE_MAX_AGE_CHANGED', entityType: 'ConnectIntegrationSettings', entityId: SETTINGS_ID, ipAddress,
      before: { maxAgeSeconds: before }, after: { maxAgeSeconds, operationalPricingEnabled: false } });
    return this.getCashPreview();
  }

  async getCashPreview() {
    const settings = await this.settings();
    const maxAgeSeconds = (settings as any).shadowPriceMaxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
    const refs = safeRefs((settings as any).shadowCashReferences);
    const products = await this.prisma.connectProduct.findMany({ where: { integrationSettingsId: SETTINGS_ID }, include: { mapping: true } });
    const latestSnapshot = await this.snapshots.findLatestValid();
    const internalReference = latestSnapshot ? {
      value: latestSnapshot.normalizedValue.toString(), unit: latestSnapshot.unit, currency: latestSnapshot.currency,
      purityReference: latestSnapshot.purityReference, capturedAt: latestSnapshot.capturedAt.toISOString(),
      fresh: isFresh(latestSnapshot.capturedAt, maxAgeSeconds),
      contractVerified: latestSnapshot.unit === 'IRR_PER_GRAM' && latestSnapshot.currency === 'IRR' && ['18K', '0.750', '750'].includes(latestSnapshot.purityReference ?? ''),
    } : null;
    const categories = await Promise.all(CATEGORIES.map(async (category) => {
      const ref = refs[category];
      const product = ref?.productId ? products.find((p) => p.id === ref.productId) : undefined;
      const mapping: any = product?.mapping;
      const reasons: string[] = [];
      if (!ref?.productId) reasons.push('NO_REFERENCE_SELECTED');
      if (ref?.productId && !product) reasons.push('PRODUCT_NOT_FOUND');
      if (product?.presenceStatus === 'NOT_SEEN') reasons.push('PRODUCT_NOT_SEEN');
      if (product?.validationStatus !== 'VALID') reasons.push('PRODUCT_INVALID');
      if (product && product.isActive !== true) reasons.push('PRODUCT_DISABLED');
      if (mapping && !mapping.isVerified) reasons.push('MAPPING_NOT_VERIFIED');
      if (product && mapping && (mapping.id !== ref?.mappingId || mapping.updatedAt.toISOString() !== ref?.mappingUpdatedAt)) reasons.push('MAPPING_VERSION_CHANGED');
      if (!mapping || mapping.internalAssetType !== 'INTERNAL_GOLD_WEIGHT' || !mapping.internalGoldPurity?.eq('0.750')) reasons.push('NOT_VERIFIED_18K_MAPPING');
      if (!mapping || normalize(mapping.externalQuantityUnit) !== 'MESGHAL' || normalize(mapping.priceUnitBasis) !== 'PER_MESGHAL' || normalize(mapping.externalPriceCurrency) !== CONNECT_CASH_CURRENCY) reasons.push('PRICE_CONTRACT_UNCONFIRMED');
      if (!mapping?.conversionFactor || !mapping.conversionFactor.eq(MESGHAL_TO_GRAM_18)) reasons.push('CONVERSION_FACTOR_INVALID');
      if (!internalReference) reasons.push('CURRENT_REFERENCE_UNAVAILABLE');
      else if (!internalReference.fresh) reasons.push('CURRENT_REFERENCE_STALE');
      else if (!internalReference.contractVerified) reasons.push('INTERNAL_PRICE_CONTRACT_UNCONFIRMED');
      if (product && (!product.lastValidAt || !isFresh(product.lastValidAt, maxAgeSeconds))) reasons.push('CONNECT_PRICE_STALE');
      const availability = !product || product.presenceStatus === 'NOT_SEEN' ? 'NOT_SEEN' : product.validationStatus !== 'VALID' ? 'INVALID' : product.isActive === false ? 'DISABLED_BY_PROVIDER' : product.isActive === true ? 'AVAILABLE' : 'INVALID';
      const sides: any = {};
      for (const side of ['buy', 'sell'] as const) {
        const active = side === 'buy' ? product?.isBuyActive : product?.isSellActive;
        const field = side === 'buy' ? 'buyPrice' : 'sellPrice';
        const sourceField = side === 'buy' ? 'buy_price' : 'sell_price';
        const value = product?.[field];
        const sideReasons = [...reasons];
        if (!value || !new Decimal(value.toString()).isFinite() || new Decimal(value.toString()).lte(0)) sideReasons.push('INVALID_PRICE');
        const raw = value ? new Decimal(value.toString()) : null;
        const priceReasons = sideReasons.filter((reason) => !['CURRENT_REFERENCE_UNAVAILABLE', 'CURRENT_REFERENCE_STALE', 'INTERNAL_PRICE_CONTRACT_UNCONFIRMED'].includes(reason));
        const gramsToman = raw && priceReasons.length === 0 ? raw.div(MESGHAL_TO_GRAM_18) : null;
        // The existing pricing contract is IRR per gram; Connect display values stay in Toman.
        const gramsRial = gramsToman?.times(TOMAN_TO_RIAL) ?? null;
        let enginePreview: any = null;
        if (gramsRial) enginePreview = await this.pricingEngine.calculatePreview({ weightGrams: new Decimal(1), purityRatio: new Decimal('0.750') }, gramsRial, `connect:${product!.externalProductId}:${sourceField}:${product!.lastValidAt!.toISOString()}`);
        const comparison = gramsRial && internalReference?.fresh && internalReference.contractVerified && latestSnapshot
          ? { unit: 'IRR_PER_GRAM', difference: gramsRial.minus(latestSnapshot.normalizedValue).toString(),
              differencePercent: latestSnapshot.normalizedValue.eq(0) ? null : gramsRial.minus(latestSnapshot.normalizedValue).div(latestSnapshot.normalizedValue).times(100).toString() }
          : null;
        sides[side] = {
          providerActive: active ?? null,
          providerActivityMeaning: 'UNCONFIRMED',
          supplierDirection: supplierDirection(sourceField),
          rawMesghalPriceToman: raw?.toString() ?? null,
          gram18PriceToman: gramsToman?.toString() ?? null,
          gram18PriceRial: gramsRial?.toString() ?? null,
          conversionReady: gramsToman !== null,
          comparisonReady: comparison !== null,
          operationalReady: false,
          comparison,
          pricingEnginePreview: enginePreview ? { price: enginePreview.finalPrice.toString(), isComplete: enginePreview.isComplete, blockedSteps: enginePreview.blockedSteps } : null,
          status: sideReasons.length ? classifyStatus(sideReasons, product?.lastValidAt, maxAgeSeconds) : 'READY',
          reasons: [...new Set(sideReasons)],
        };
      }
      const categoryStatus = reasons.length
        ? classifyStatus(reasons, product?.lastValidAt, maxAgeSeconds)
        : sides.buy.status === 'READY' || sides.sell.status === 'READY'
          ? 'READY'
          : sides.buy.status === 'INVALID_PRICE' && sides.sell.status === 'INVALID_PRICE'
            ? 'INVALID_PRICE'
            : sides.buy.status === 'UNAVAILABLE' && sides.sell.status === 'UNAVAILABLE'
              ? 'UNAVAILABLE'
              : 'NOT_READY';
      return {
        category, label: categoryLabel(category), selectedProductId: ref?.productId ?? null,
        product: product ? { id: product.id, externalProductId: product.externalProductId, title: product.title, validationStatus: product.validationStatus,
          presenceStatus: product.presenceStatus, isActive: product.isActive, lastFetchedAt: product.lastFetchedAt?.toISOString() ?? null,
          lastValidAt: product.lastValidAt?.toISOString() ?? null, availability,
          mapping: mapping ? { id: mapping.id, version: mapping.updatedAt.toISOString(), category: mapping.cashPriceCategory, isVerified: mapping.isVerified,
            currency: mapping.externalPriceCurrency, quantityUnit: mapping.externalQuantityUnit, priceBasis: mapping.priceUnitBasis,
            purity: mapping.internalGoldPurity?.toString() ?? null, conversionFactor: mapping.conversionFactor?.toString() ?? null } : null } : null,
        displayMode: (settings as any).shadowDisplayMode ?? 'BOTH', sides,
        status: categoryStatus,
        conversionReady: Object.values(sides).some((side: any) => side.conversionReady),
        comparisonReady: Object.values(sides).some((side: any) => side.comparisonReady),
        operationalReady: false,
        reasons: [...new Set(reasons)],
        historicalOnly: Boolean(product && (availability !== 'AVAILABLE' || !product.lastValidAt || !isFresh(product.lastValidAt, maxAgeSeconds))),
        internalReference: internalReference ? { ...internalReference, value: internalReference.value } : null,
        trace: product && mapping ? { productId: product.id, mappingId: mapping.id, mappingVersion: mapping.updatedAt.toISOString() } : null,
      };
    }));
    return { mode: 'SHADOW_ONLY', notice: 'قیمت‌های این بخش آزمایشی هستند و در معاملات مشتری اعمال نمی‌شوند.', displayMode: (settings as any).shadowDisplayMode ?? 'BOTH',
      maxPriceAgeSeconds: maxAgeSeconds, maxAgeSeconds, categories, comparisonReady: categories.some((category) => category.comparisonReady), operationalReady: false, operationalPricingEnabled: false };
  }

  async getPreview() {
    const settings: any = await this.settings();
    const maxAgeSeconds = settings.shadowPriceMaxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
    const latestSnapshot = await this.snapshots.findLatestValid();
    const reference = latestSnapshot ? { value: latestSnapshot.normalizedValue.toFixed(6), unit: latestSnapshot.unit, currency: latestSnapshot.currency,
      purityReference: latestSnapshot.purityReference, capturedAt: latestSnapshot.capturedAt.toISOString(), fresh: isFresh(latestSnapshot.capturedAt, maxAgeSeconds) } : null;
    const product = settings.shadowReferenceProductId ? await this.product(settings.shadowReferenceProductId).catch(() => null) : null;
    const mapping: any = product?.mapping;
    const priceField = settings.shadowReferencePriceField as ShadowPriceField | null;
    const direction = priceField === 'buy_price' ? mapping?.connectBuySide : priceField === 'sell_price' ? mapping?.connectSellSide : null;
    const supplierSide = priceField ? supplierDirection(priceField) : null;
    const reasons: string[] = [];
    if (!product) reasons.push('NO_CANDIDATE_SELECTED');
    if (product && product.validationStatus !== 'VALID') reasons.push('PRODUCT_NOT_VALID');
    if (product && product.presenceStatus !== 'SEEN') reasons.push('PRODUCT_NOT_SEEN');
    if (product && product.isActive !== true) reasons.push('PRODUCT_INACTIVE');
    if (product && !mapping?.isVerified) reasons.push('MAPPING_NOT_VERIFIED');
    if (product && mapping && (!mapping.internalGoldPurity || !mapping.internalGoldPurity.eq('0.750'))) reasons.push('NOT_VERIFIED_18K_MAPPING');
    if (product && mapping && (!mapping.externalQuantityUnit || !mapping.externalPriceCurrency || !mapping.priceUnitBasis)) reasons.push('MAPPING_UNIT_CURRENCY_OR_BASIS_MISSING');
    if (product && mapping && (settings.shadowReferenceMappingId !== mapping.id || settings.shadowReferenceMappingUpdatedAt?.getTime() !== mapping.updatedAt.getTime())) reasons.push('MAPPING_VERSION_CHANGED');
    if (product && (!product.lastValidAt || !isFresh(product.lastValidAt, maxAgeSeconds))) reasons.push('CONNECT_PRICE_STALE');
    if (product && !direction) reasons.push('PRICE_DIRECTION_UNCONFIRMED');
    if (reference && !['18K', '0.750', '750'].includes(reference.purityReference ?? '')) reasons.push('PRICE_CONTRACT_UNRESOLVED');
    const raw = product ? (priceField === 'buy_price' ? product.buyPrice : product.sellPrice) : null;
    const livePriceAvailable = Boolean(product && product.validationStatus === 'VALID' && product.presenceStatus === 'SEEN' && product.isActive === true && product.lastValidAt && isFresh(product.lastValidAt, maxAgeSeconds));
    return { mode: 'SHADOW_CANDIDATE', status: reasons.length ? 'NOT_READY' : 'READY', notice: 'این قیمت آزمایشی است و در خرید و فروش مشتریان اعمال نمی‌شود.',
      candidate: product ? { id: product.id, externalProductId: product.externalProductId, title: product.title, validationStatus: product.validationStatus,
        presenceStatus: product.presenceStatus, isActive: product.isActive, mapping: mapping ? { id: mapping.id, version: mapping.updatedAt.toISOString(),
          internalAssetType: mapping.internalAssetType, internalGoldPurity: mapping.internalGoldPurity?.toString() ?? null, externalQuantityUnit: mapping.externalQuantityUnit,
          externalPriceCurrency: mapping.externalPriceCurrency, priceUnitBasis: mapping.priceUnitBasis, conversionFactor: mapping.conversionFactor?.toString() ?? null,
          isVerified: mapping.isVerified, selectedPriceField: priceField, selectedPriceDirection: supplierSide, mappedInternalSide: direction } : null } : null,
      currentReference: reference, connectPrice: raw && product ? { value: livePriceAvailable ? new Decimal(raw.toString()).toString() : null,
        historicalValue: livePriceAvailable ? null : new Decimal(raw.toString()).toString(), currencyAsMapped: mapping?.externalPriceCurrency ?? null,
        quantityUnitAsMapped: mapping?.externalQuantityUnit ?? null, priceBasisAsMapped: mapping?.priceUnitBasis ?? null, field: priceField,
        supplierDirection: supplierSide, live: livePriceAvailable,
        capturedAt: product.lastValidAt?.toISOString() ?? null, fresh: Boolean(product.lastValidAt && isFresh(product.lastValidAt, maxAgeSeconds)) } : null,
      difference: null, maxAgeSeconds, reasons: [...new Set(reasons)], trace: product && mapping ? { productId: product.id, mappingId: mapping.id, mappingVersion: mapping.updatedAt.toISOString() } : null,
      operationalPricingEnabled: false };
  }

  private async settings(): Promise<any> {
    const row = await this.prisma.connectIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row) throw new NotFoundException('تنظیمات Connect پیدا نشد.');
    return row;
  }
  private async product(id: string): Promise<any> {
    const row = await this.prisma.connectProduct.findFirst({ where: { id, integrationSettingsId: SETTINGS_ID }, include: { mapping: true } });
    if (!row) throw new NotFoundException('محصول Connect پیدا نشد.');
    return row;
  }
}

function isEligibleMapping(product: any, mapping: any): boolean {
  return product.validationStatus === 'VALID' && product.presenceStatus === 'SEEN' && product.isActive === true && Boolean(product.lastFetchedAt && product.lastValidAt) &&
    mapping?.isVerified === true && mapping.internalAssetType === 'INTERNAL_GOLD_WEIGHT' && mapping.internalGoldPurity?.eq('0.750') &&
    Boolean(mapping.externalQuantityUnit?.trim() && mapping.externalPriceCurrency?.trim() && mapping.priceUnitBasis?.trim() && mapping.conversionFactor?.isFinite() && mapping.conversionFactor.gt(0));
}
function safeRefs(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, any>;
}
function normalize(value: unknown): string { return typeof value === 'string' ? value.trim().toUpperCase().replace(/[ -]/g, '_') : ''; }
function isFresh(date: Date, maxAgeSeconds: number): boolean { const age = Date.now() - date.getTime(); return age >= 0 && age <= maxAgeSeconds * 1000; }
function classifyStatus(reasons: string[], capturedAt: Date | null | undefined, maxAgeSeconds: number): string {
  if (reasons.some((r) => r.includes('NOT_SEEN') || r.includes('NOT_FOUND') || r.includes('DISABLED'))) return 'UNAVAILABLE';
  if (reasons.some((r) => r.includes('STALE')) || (capturedAt && !isFresh(capturedAt, maxAgeSeconds))) return 'STALE';
  if (reasons.includes('INVALID_PRICE')) return 'INVALID_PRICE';
  if (reasons.some((r) => ['MAPPING_NOT_VERIFIED', 'MAPPING_VERSION_CHANGED', 'NOT_VERIFIED_18K_MAPPING', 'PRICE_CONTRACT_UNCONFIRMED', 'CONVERSION_FACTOR_INVALID'].includes(r))) return 'INVALID_MAPPING';
  return reasons.length ? 'NOT_READY' : 'READY';
}
function categoryLabel(category: CashCategory): string {
  return category === 'CASH_SPOT' ? 'نقد حاضر' : category === 'CASH_TOMORROW' ? 'نقد فردا' : 'نقد پس‌فردا';
}
