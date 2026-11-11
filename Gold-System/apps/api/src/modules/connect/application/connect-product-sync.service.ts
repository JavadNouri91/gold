import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ConnectProductPresenceStatus,
  ConnectProductValidationStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { decryptConnectSecret } from '../../../common/crypto/secret-box';
import { validateProductList, validateProductRow } from '../infrastructure/connect-http.client';
import { ConnectHttpClient } from '../infrastructure/connect-http.client';
import type { ConnectProductValidationIssue } from '../domain/interfaces/connect-provider.port';

const SETTINGS_ID = 'global';
const LOCK_MS = 5 * 60_000;
const SAFE_CODES = new Set([
  'ENDPOINT_NOT_ALLOWED',
  'DNS_FAILURE',
  'UNSAFE_DNS_RESULT',
  'REDIRECT_REJECTED',
  'RESPONSE_TOO_LARGE',
  'CONNECTION_TIMEOUT',
  'TLS_ERROR',
  'CONNECTION_FAILED',
  'TIMEOUT',
  'NETWORK_ERROR',
  'HTTP_401',
  'HTTP_403',
  'HTTP_429',
  'HTTP_5XX',
  'AUTHENTICATION_FAILED',
  'ACCESS_FORBIDDEN',
  'RATE_LIMITED',
  'HTTP_ERROR',
  'INVALID_JSON',
  'INVALID_RESPONSE',
  'INVALID_PRODUCTS_RESPONSE',
  'INVALID_PRODUCT_ID',
  'CONNECT_SYNC_FAILED',
]);

@Injectable()
export class ConnectProductSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly http: ConnectHttpClient,
  ) {}

  async list(
    query: {
      page?: number;
      pageSize?: number;
      search?: string;
      validationStatus?: string;
      isActive?: boolean;
      mappingStatus?: string;
    } = {},
  ) {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 100)));
    const where: Prisma.ConnectProductWhereInput = {
      integrationSettingsId: SETTINGS_ID,
      ...(query.validationStatus ? { validationStatus: query.validationStatus as never } : {}),
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search.slice(0, 100), mode: 'insensitive' } },
              { externalProductId: { contains: query.search.slice(0, 100), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.mappingStatus === 'MAPPED'
        ? { mapping: { isNot: null } }
        : query.mappingStatus === 'UNMAPPED'
          ? { mapping: null }
          : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.connectProduct.findMany({
        where,
        orderBy: [{ title: 'asc' }, { externalProductId: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { mapping: true },
      }),
      this.prisma.connectProduct.count({ where }),
    ]);
    return {
      items: rows.map(sanitizeProduct),
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  async get(id: string) {
    const product = await this.prisma.connectProduct.findFirst({
      where: { id, integrationSettingsId: SETTINGS_ID },
      include: { mapping: true },
    });
    if (!product) throw new NotFoundException('محصول Connect پیدا نشد.');
    return sanitizeProduct(product);
  }

  async sync(actorId: string, ipAddress?: string) {
    const settings = await this.prisma.connectIntegrationSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!settings?.isEnabled)
      throw new BadRequestException('اتصال Connect غیرفعال است. ابتدا تنظیمات اتصال را فعال کنید.');
    if (!settings.accessKeyEncrypted || !settings.accessSecretEncrypted)
      throw new BadRequestException('اعتبارنامه‌های Connect تنظیم نشده‌اند.');
    const token = randomUUID();
    const now = new Date();
    const acquired = await this.prisma.connectIntegrationSettings.updateMany({
      where: {
        id: SETTINGS_ID,
        OR: [{ catalogSyncLockExpiresAt: null }, { catalogSyncLockExpiresAt: { lt: now } }],
      },
      data: {
        catalogSyncLockToken: token,
        catalogSyncLockExpiresAt: new Date(now.getTime() + LOCK_MS),
      },
    });
    if (acquired.count !== 1) throw new ConflictException('همگام‌سازی دیگری در حال اجراست.');

    const startedAt = Date.now();
    let run: { id: string } | null = null;
    try {
      run = await this.prisma.connectProductSync.create({
        data: { integrationSettingsId: SETTINGS_ID, initiatedById: actorId },
      });
      const key = decryptConnectSecret(settings.accessKeyEncrypted);
      const secret = decryptConnectSecret(settings.accessSecretEncrypted);
      const payload = await this.http.fetchProductsForSync(settings.httpBaseUrl, key, secret);
      const validation = validateProductList(payload);
      const prepared = payload.map((value, index) => {
        const rowValidation = validateProductRow(value, index);
        return prepareProduct(value, rowValidation.issues);
      });
      const identified = prepared.filter((item): item is PreparedProduct =>
        Boolean(item?.externalProductId),
      );
      const ids = [...new Set(identified.map((item) => item.externalProductId))];
      if (ids.length !== identified.length)
        throw new BadRequestException(
          'پاسخ Connect شناسه محصول تکراری دارد. همگام‌سازی اعمال نشد.',
        );

      const result = await this.prisma.$transaction(async (tx) => {
        // Fence this write transaction against an expired/replaced lease. Locking the
        // settings row also prevents a new owner from acquiring the lease while the
        // catalog changes are being committed.
        const leaseRows = await tx.$queryRaw<
          Array<{ catalog_sync_lock_token: string | null; catalog_sync_lock_expires_at: Date | null }>
        >`
          SELECT "catalog_sync_lock_token", "catalog_sync_lock_expires_at"
          FROM "connect_integration_settings"
          WHERE "id" = ${SETTINGS_ID}
          FOR UPDATE
        `;
        const lease = leaseRows[0];
        if (
          !lease ||
          lease.catalog_sync_lock_token !== token ||
          !lease.catalog_sync_lock_expires_at ||
          lease.catalog_sync_lock_expires_at <= new Date()
        ) {
          throw new ConflictException('همگام‌سازی از مالکیت قفل خارج شده؛ نتیجه اعمال نشد.');
        }

        const existing = await tx.connectProduct.findMany({
          where: { integrationSettingsId: SETTINGS_ID, externalProductId: { in: ids } },
          select: {
            id: true,
            externalProductId: true,
            title: true,
            buyPrice: true,
            sellPrice: true,
            isActive: true,
            isBuyActive: true,
            isSellActive: true,
          },
        });
        const previous = new Map(existing.map((row) => [row.externalProductId, row]));
        let newCount = 0;
        let updatedCount = 0;
        for (const item of identified) {
          const old = previous.get(item.externalProductId);
          const data = {
            title: item.titleValid ? item.title : (old?.title ?? null),
            ...(item.buyPriceValid
              ? { buyPrice: new Prisma.Decimal(item.buyPrice as number) }
              : {}),
            ...(item.sellPriceValid
              ? { sellPrice: new Prisma.Decimal(item.sellPrice as number) }
              : {}),
            ...(item.isActiveValid ? { isActive: item.isActive as boolean } : {}),
            ...(item.isBuyActiveValid ? { isBuyActive: item.isBuyActive as boolean } : {}),
            ...(item.isSellActiveValid ? { isSellActive: item.isSellActive as boolean } : {}),
            validationStatus:
              item.issues.length === 0
                ? ConnectProductValidationStatus.VALID
                : item.titleValid && (item.buyPriceValid || item.sellPriceValid)
                  ? ConnectProductValidationStatus.PARTIAL
                  : ConnectProductValidationStatus.INVALID,
            presenceStatus: ConnectProductPresenceStatus.SEEN,
            lastValidationErrors: item.issues as unknown as Prisma.InputJsonValue,
            lastFetchedAt: new Date(),
            ...(item.issues.length === 0 ? { lastValidAt: new Date() } : {}),
            lastSeenSyncId: run!.id,
          };
          if (old) {
            await tx.connectProduct.update({ where: { id: old.id }, data });
            updatedCount += 1;
          } else {
            await tx.connectProduct.create({
              data: {
                ...data,
                integrationSettingsId: SETTINGS_ID,
                externalProductId: item.externalProductId,
              },
            });
            newCount += 1;
          }
        }
        const notSeen = await tx.connectProduct.updateMany({
          where: {
            integrationSettingsId: SETTINGS_ID,
            presenceStatus: 'SEEN',
            ...(ids.length ? { externalProductId: { notIn: ids } } : {}),
          },
          data: { presenceStatus: 'NOT_SEEN' },
        });
        const status = validation.diagnostic.invalidProductsCount > 0 ? 'WARNING' : 'SUCCESS';
        await tx.connectProductSync.update({
          where: { id: run!.id },
          data: {
            status,
            totalCount: payload.length,
            validCount: validation.diagnostic.validProductsCount,
            invalidCount: validation.diagnostic.invalidProductsCount,
            newCount,
            updatedCount,
            notSeenCount: notSeen.count,
            responseTimeMs: Date.now() - startedAt,
            finishedAt: new Date(),
          },
        });
        return {
          success: true,
          status,
          totalCount: payload.length,
          validCount: validation.diagnostic.validProductsCount,
          invalidCount: validation.diagnostic.invalidProductsCount,
          newCount,
          updatedCount,
          notSeenCount: notSeen.count,
          unpersistedInvalidIdCount: prepared.filter((item) => item === null).length,
          issues: validation.diagnostic.issues,
          issuesTruncated: validation.diagnostic.issuesTruncated,
          responseTimeMs: Date.now() - startedAt,
          completedAt: new Date().toISOString(),
        };
      });
      await this.audit.log({
        actorId,
        action: 'CONNECT_PRODUCTS_SYNC',
        entityType: 'ConnectProductSync',
        entityId: run!.id,
        ipAddress,
        after: {
          status: result.status,
          totalCount: result.totalCount,
          validCount: result.validCount,
          invalidCount: result.invalidCount,
          newCount: result.newCount,
          updatedCount: result.updatedCount,
          notSeenCount: result.notSeenCount,
          unpersistedInvalidIdCount: result.unpersistedInvalidIdCount,
          issueCount: result.issues.length,
          responseTimeMs: result.responseTimeMs,
        },
      });
      return result;
    } catch (error) {
      const code = safeCode(error);
      if (run) {
        await this.prisma.connectProductSync.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            errorCode: code,
            finishedAt: new Date(),
            responseTimeMs: Date.now() - startedAt,
          },
        });
        await this.audit.log({
          actorId,
          action: 'CONNECT_PRODUCTS_SYNC_FAILED',
          entityType: 'ConnectProductSync',
          entityId: run.id,
          ipAddress,
          after: { errorCode: code },
        });
      }
      if (error instanceof BadRequestException || error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException(
        'همگام‌سازی محصولات انجام نشد. وضعیت اتصال و اعتبارنامه‌ها را بررسی کنید.',
      );
    } finally {
      await this.prisma.connectIntegrationSettings.updateMany({
        where: { id: SETTINGS_ID, catalogSyncLockToken: token },
        data: { catalogSyncLockToken: null, catalogSyncLockExpiresAt: null },
      });
    }
  }

  async syncStatus() {
    const [latest, counts, mappedCount, totalCount] = await Promise.all([
      this.prisma.connectProductSync.findFirst({
        where: { integrationSettingsId: SETTINGS_ID },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.connectProduct.groupBy({
        by: ['validationStatus', 'isActive'],
        where: { integrationSettingsId: SETTINGS_ID },
        _count: { _all: true },
      }),
      this.prisma.connectProductMapping.count({
        where: { connectProduct: { integrationSettingsId: SETTINGS_ID } },
      }),
      this.prisma.connectProduct.count({ where: { integrationSettingsId: SETTINGS_ID } }),
    ]);
    return {
      latest: latest
        ? {
            status: latest.status,
            totalCount: latest.totalCount,
            validCount: latest.validCount,
            invalidCount: latest.invalidCount,
            newCount: latest.newCount,
            updatedCount: latest.updatedCount,
            notSeenCount: latest.notSeenCount,
            errorCode: latest.errorCode,
            responseTimeMs: latest.responseTimeMs,
            startedAt: latest.startedAt.toISOString(),
            finishedAt: latest.finishedAt?.toISOString() ?? null,
          }
        : null,
      counts: counts.map((row) => ({
        validationStatus: row.validationStatus,
        isActive: row.isActive,
        count: row._count._all,
      })),
      totalCount,
      mappedCount,
      unmappedCount: Math.max(0, totalCount - mappedCount),
    };
  }

  async getMapping(productId: string) {
    const product = await this.prisma.connectProduct.findFirst({
      where: { id: productId, integrationSettingsId: SETTINGS_ID },
      include: { mapping: true },
    });
    if (!product) throw new NotFoundException('محصول Connect پیدا نشد.');
    return product.mapping;
  }

  async saveMapping(
    productId: string,
    input: Record<string, unknown>,
    actorId: string,
    ipAddress?: string,
  ) {
    await this.assertProduct(productId);
    const before = await this.prisma.connectProductMapping.findUnique({
      where: { connectProductId: productId },
    });
    const data = mappingData(input);
    const saved = await this.prisma.connectProductMapping.upsert({
      where: { connectProductId: productId },
      create: { connectProductId: productId, ...data, isEnabled: false, isVerified: false },
      update: {
        ...data,
        isEnabled: false,
        isVerified: false,
        verifiedById: null,
        verifiedAt: null,
      },
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_PRODUCT_MAPPING_CHANGED',
      entityType: 'ConnectProductMapping',
      entityId: saved.id,
      ipAddress,
      before: safeMappingAudit(before),
      after: safeMappingAudit(saved),
    });
    return saved;
  }

  async verifyMapping(productId: string, actorId: string, ipAddress?: string) {
    const product = await this.prisma.connectProduct.findFirst({
      where: {
        id: productId,
        integrationSettingsId: SETTINGS_ID,
        validationStatus: 'VALID',
        presenceStatus: 'SEEN',
      },
      include: { mapping: true },
    });
    if (!product)
      throw new BadRequestException('فقط محصول حاضر با داده کاملاً معتبر قابلیت تأیید نگاشت دارد.');
    const mapping = product.mapping;
    if (!mapping) throw new BadRequestException('ابتدا پیش‌نویس نگاشت را ذخیره کنید.');
    if (
      mapping.internalAssetType !== 'INTERNAL_GOLD_WEIGHT' ||
      !mapping.internalGoldPurity ||
      mapping.internalGoldPurity.lte(0) ||
      mapping.internalGoldPurity.gt(1) ||
      !mapping.externalQuantityUnit ||
      !mapping.externalPriceCurrency ||
      !mapping.priceUnitBasis ||
      !mapping.conversionFactor ||
      mapping.conversionFactor.lte(0) ||
      !mapping.connectBuySide ||
      !mapping.connectSellSide ||
      mapping.connectBuySide === mapping.connectSellSide
    ) {
      throw new BadRequestException(
        'مشخصات دارایی، عیار نسبی، واحدها، ضریب تبدیل و جهت مستقل خرید و فروش باید معتبر و کامل باشند.',
      );
    }
    const verified = await this.prisma.connectProductMapping.update({
      where: { id: mapping.id },
      data: { isVerified: true, isEnabled: false, verifiedById: actorId, verifiedAt: new Date() },
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_PRODUCT_MAPPING_VERIFIED',
      entityType: 'ConnectProductMapping',
      entityId: verified.id,
      ipAddress,
      after: safeMappingAudit(verified),
    });
    return verified;
  }

  async disableMapping(productId: string, actorId: string, ipAddress?: string) {
    const mapping = await this.prisma.connectProductMapping.findUnique({
      where: { connectProductId: productId },
    });
    if (!mapping) throw new NotFoundException('نگاشت محصول پیدا نشد.');
    const updated = await this.prisma.connectProductMapping.update({
      where: { id: mapping.id },
      data: { isEnabled: false, isVerified: false, verifiedAt: null, verifiedById: null },
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_PRODUCT_MAPPING_DISABLED',
      entityType: 'ConnectProductMapping',
      entityId: updated.id,
      ipAddress,
      after: { isEnabled: false, isVerified: false },
    });
    return updated;
  }

  private async assertProduct(id: string) {
    if (
      !(await this.prisma.connectProduct.findFirst({
        where: { id, integrationSettingsId: SETTINGS_ID },
        select: { id: true },
      }))
    )
      throw new NotFoundException('محصول Connect پیدا نشد.');
  }
}

type PreparedProduct = {
  externalProductId: string;
  title: string | null;
  titleValid: boolean;
  buyPrice?: number;
  sellPrice?: number;
  buyPriceValid: boolean;
  sellPriceValid: boolean;
  isActive?: boolean;
  isBuyActive?: boolean;
  isSellActive?: boolean;
  isActiveValid: boolean;
  isBuyActiveValid: boolean;
  isSellActiveValid: boolean;
  issues: ConnectProductValidationIssue[];
};

function prepareProduct(
  value: unknown,
  allIssues: ConnectProductValidationIssue[],
): PreparedProduct | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const local = allIssues;
  const has = (field: string) => !local.some((issue) => issue.field === field);
  if (!has('id')) return null;
  const titleValid = has('title');
  const validNumber = (field: 'buy_price' | 'sell_price') =>
    has(field) &&
    typeof row[field] === 'number' &&
    Number.isFinite(row[field]) &&
    (row[field] as number) >= 0;
  const validBoolean = (field: 'is_active' | 'is_buy_active' | 'is_sell_active') =>
    has(field) && typeof row[field] === 'boolean';
  return {
    externalProductId: (row.id as string).trim(),
    title: titleValid ? (row.title as string).trim() : null,
    titleValid,
    buyPrice: validNumber('buy_price') ? (row.buy_price as number) : undefined,
    sellPrice: validNumber('sell_price') ? (row.sell_price as number) : undefined,
    buyPriceValid: validNumber('buy_price'),
    sellPriceValid: validNumber('sell_price'),
    isActive: validBoolean('is_active') ? (row.is_active as boolean) : undefined,
    isBuyActive: validBoolean('is_buy_active') ? (row.is_buy_active as boolean) : undefined,
    isSellActive: validBoolean('is_sell_active') ? (row.is_sell_active as boolean) : undefined,
    isActiveValid: validBoolean('is_active'),
    isBuyActiveValid: validBoolean('is_buy_active'),
    isSellActiveValid: validBoolean('is_sell_active'),
    issues: local,
  };
}
type ProductWithMapping = Prisma.ConnectProductGetPayload<{ include: { mapping: true } }>;
type ProductMappingRecord = NonNullable<ProductWithMapping['mapping']>;

function sanitizeProduct(row: ProductWithMapping) {
  return {
    ...row,
    buyPrice: row.buyPrice?.toString() ?? null,
    sellPrice: row.sellPrice?.toString() ?? null,
    lastValidationErrors: Array.isArray(row.lastValidationErrors) ? row.lastValidationErrors : [],
    mapping: row.mapping ? sanitizeMapping(row.mapping) : null,
  };
}
function sanitizeMapping(row: ProductMappingRecord) {
  return {
    ...row,
    internalGoldPurity: row.internalGoldPurity?.toString() ?? null,
    conversionFactor: row.conversionFactor?.toString() ?? null,
  };
}
function mappingData(input: Record<string, unknown>) {
  const strings = [
    'internalAssetType',
    'externalQuantityUnit',
    'externalPriceCurrency',
    'priceUnitBasis',
    'cashPriceCategory',
  ] as const;
  const data: Record<string, unknown> = {};
  for (const key of strings) {
    const value = input[key];
    if (
      value !== undefined &&
      value !== null &&
      (typeof value !== 'string' || value.trim().length > 100)
    )
      throw new BadRequestException(`فیلد ${key} معتبر نیست.`);
    data[key] = typeof value === 'string' && value.trim() ? value.trim() : null;
  }
  const decimal = (key: 'internalGoldPurity' | 'conversionFactor', max: number) => {
    const value = input[key];
    if (value === undefined || value === null || value === '') return null;
    if (!/^(?:\d+)(?:\.\d{1,10})?$/.test(String(value)))
      throw new BadRequestException(`فیلد ${key} باید عدد اعشاری مثبت باشد.`);
    const parsed = new Prisma.Decimal(String(value));
    if (!parsed.isFinite() || parsed.lte(0) || parsed.gt(max))
      throw new BadRequestException(`فیلد ${key} خارج از بازه مجاز است.`);
    return parsed;
  };
  data.internalGoldPurity = decimal('internalGoldPurity', 1);
  data.conversionFactor = decimal('conversionFactor', Number.MAX_SAFE_INTEGER);
  for (const key of ['connectBuySide', 'connectSellSide'] as const) {
    const value = input[key];
    if (
      value !== undefined &&
      value !== null &&
      value !== 'INTERNAL_BUY' &&
      value !== 'INTERNAL_SELL'
    )
      throw new BadRequestException(`فیلد ${key} معتبر نیست.`);
    data[key] = value ?? null;
  }
  return data;
}
function safeMappingAudit(row: ProductMappingRecord | null) {
  return row
    ? {
        internalAssetType: row.internalAssetType,
        internalGoldPurity: row.internalGoldPurity?.toString() ?? null,
        externalQuantityUnit: row.externalQuantityUnit,
        externalPriceCurrency: row.externalPriceCurrency,
        priceUnitBasis: row.priceUnitBasis,
        cashPriceCategory: (row as any).cashPriceCategory ?? null,
        conversionFactor: row.conversionFactor?.toString() ?? null,
        connectBuySide: row.connectBuySide,
        connectSellSide: row.connectSellSide,
        isEnabled: row.isEnabled,
        isVerified: row.isVerified,
      }
    : null;
}
function safeCode(error: unknown) {
  const raw =
    error instanceof Error && 'code' in error
      ? String((error as Error & { code?: unknown }).code)
      : '';
  return SAFE_CODES.has(raw) ? raw : 'CONNECT_SYNC_FAILED';
}
