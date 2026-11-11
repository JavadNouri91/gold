import { BadRequestException, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { PrismaService } from '../../../database/prisma.service';
import { AuditService } from '../../audit/application/audit.service';
import { encryptConnectSecret, decryptConnectSecret } from '../../../common/crypto/secret-box';
import { UpdateConnectSettingsDto } from './dto/update-connect-settings.dto';
import { ConnectClientError, ConnectHttpClient } from '../infrastructure/connect-http.client';
import type { ConnectProductValidationDiagnostic } from '../domain/interfaces/connect-provider.port';

const SETTINGS_ID = 'global';
const DEFAULT_HTTP = 'https://connect.tala-app.ir';
const DEFAULT_WS = 'wss://connect.tala-app.ir/ws';
const ALLOWED_HOSTS = new Set(['connect.tala-app.ir']);

@Injectable()
export class ConnectSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly http: ConnectHttpClient,
  ) {}

  async getSettings() {
    const row = await this.row();
    return this.toView(row);
  }

  async update(input: UpdateConnectSettingsDto, actorId: string, ipAddress?: string) {
    const old = await this.row();
    const httpBaseUrl =
      input.httpBaseUrl === undefined
        ? (old?.httpBaseUrl ?? DEFAULT_HTTP)
        : validateEndpoint(input.httpBaseUrl, 'https:');
    const websocketUrl =
      input.websocketUrl === undefined
        ? (old?.websocketUrl ?? DEFAULT_WS)
        : validateEndpoint(input.websocketUrl, 'wss:');
    const endpointChanged =
      httpBaseUrl !== (old?.httpBaseUrl ?? DEFAULT_HTTP) ||
      websocketUrl !== (old?.websocketUrl ?? DEFAULT_WS);
    const changedSecrets = (['accessKey', 'accessSecret', 'webhookSecret'] as const).filter(
      (key) => input[key] !== undefined && input[key]!.trim() !== '',
    );
    const secretChanged = changedSecrets.length > 0;
    const setSecret = (value: string | undefined, previous: string | null | undefined) =>
      value === undefined || value.trim() === ''
        ? (previous ?? null)
        : encryptConnectSecret(value.trim());
    const data = {
      httpBaseUrl,
      websocketUrl,
      accessKeyEncrypted: setSecret(input.accessKey, old?.accessKeyEncrypted),
      accessSecretEncrypted: setSecret(input.accessSecret, old?.accessSecretEncrypted),
      webhookSecretEncrypted: setSecret(input.webhookSecret, old?.webhookSecretEncrypted),
      isEnabled: input.isEnabled ?? old?.isEnabled ?? false,
      priceSyncEnabled: input.priceSyncEnabled ?? old?.priceSyncEnabled ?? false,
      // These are stored as future configuration only. No transaction sender exists.
      externalBuyEnabled: input.externalBuyEnabled ?? old?.externalBuyEnabled ?? false,
      externalSellEnabled: input.externalSellEnabled ?? old?.externalSellEnabled ?? false,
      lastHttpCheckAt: endpointChanged || secretChanged ? null : (old?.lastHttpCheckAt ?? null),
      lastHttpCheckStatus:
        endpointChanged || secretChanged ? null : (old?.lastHttpCheckStatus ?? null),
      lastWebSocketCheckAt:
        endpointChanged || secretChanged ? null : (old?.lastWebSocketCheckAt ?? null),
      lastWebSocketCheckStatus:
        endpointChanged || secretChanged ? null : (old?.lastWebSocketCheckStatus ?? null),
      lastConnectionErrorCode:
        endpointChanged || secretChanged ? null : (old?.lastConnectionErrorCode ?? null),
      lastSuccessfulCheckAt:
        endpointChanged || secretChanged ? null : (old?.lastSuccessfulCheckAt ?? null),
    };
    const saved = await this.prisma.connectIntegrationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_SETTINGS_CHANGED',
      entityType: 'ConnectIntegrationSettings',
      entityId: SETTINGS_ID,
      ipAddress,
      before: this.auditView(old),
      after: { ...this.auditView(saved), changedSecretTypes: changedSecrets },
    });
    return this.toView(saved);
  }

  async removeSecret(secret: string, confirmed: boolean, actorId: string, ipAddress?: string) {
    if (!confirmed) throw new BadRequestException('برای حذف اطلاعات محرمانه، تأیید صریح لازم است.');
    const field = (
      {
        accessKey: 'accessKeyEncrypted',
        accessSecret: 'accessSecretEncrypted',
        webhookSecret: 'webhookSecretEncrypted',
      } as const
    )[secret as 'accessKey' | 'accessSecret' | 'webhookSecret'];
    if (!field) throw new BadRequestException('نوع اطلاعات محرمانه معتبر نیست.');
    const existing = await this.row();
    if (!existing) return this.toView(null);
    const updates: Record<string, unknown> = { [field]: null };
    if (secret !== 'webhookSecret') {
      updates.lastHttpCheckAt = null;
      updates.lastHttpCheckStatus = null;
      updates.lastWebSocketCheckAt = null;
      updates.lastWebSocketCheckStatus = null;
      updates.lastConnectionErrorCode = null;
      updates.lastSuccessfulCheckAt = null;
    }
    const updated = await this.prisma.connectIntegrationSettings.update({
      where: { id: SETTINGS_ID },
      data: updates,
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_SECRET_REMOVED',
      entityType: 'ConnectIntegrationSettings',
      entityId: SETTINGS_ID,
      ipAddress,
      after: { secretType: secret },
    });
    return this.toView(updated);
  }

  async testHttp(actorId: string, ipAddress?: string) {
    const row = await this.row();
    const checkedAt = new Date();
    let result: {
      success: boolean;
      connectionStatus: 'CONNECTED_VALID' | 'CONNECTED_WITH_WARNINGS' | 'CONNECTION_FAILED';
      httpConnected: boolean;
      dataValidationStatus: 'VALID' | 'PARTIAL' | 'INVALID' | 'INVALID_RESPONSE' | 'NOT_CHECKED';
      errorCode: string | null;
      productsCount: number | null;
      validProductsCount: number | null;
      invalidProductsCount: number | null;
      pricingReady: false;
      responseTimeMs: number | null;
      diagnostic: ConnectProductValidationDiagnostic | null;
    };
    if (!row?.accessKeyEncrypted || !row.accessSecretEncrypted) {
      result = {
        success: false,
        connectionStatus: 'CONNECTION_FAILED',
        httpConnected: false,
        dataValidationStatus: 'NOT_CHECKED',
        errorCode: 'CREDENTIALS_NOT_CONFIGURED',
        productsCount: null,
        validProductsCount: null,
        invalidProductsCount: null,
        pricingReady: false,
        responseTimeMs: null,
        diagnostic: null,
      };
    } else {
      const startedAt = Date.now();
      try {
        const accessKey = decryptConnectSecret(row.accessKeyEncrypted);
        const accessSecret = decryptConnectSecret(row.accessSecretEncrypted);
        const checked = await this.http.getProducts(row.httpBaseUrl, accessKey, accessSecret);
        result = {
          ...checked,
          errorCode: checked.diagnostic?.issues[0]?.errorCode ?? null,
        };
      } catch (error) {
        const errorCode = safeErrorCode(error);
        const diagnostic = error instanceof ConnectClientError ? (error.diagnostic ?? null) : null;
        const isInvalidResponse =
          errorCode === 'INVALID_JSON' ||
          errorCode === 'INVALID_RESPONSE' ||
          errorCode === 'INVALID_PRODUCTS_RESPONSE';
        result = {
          success: false,
          connectionStatus: 'CONNECTION_FAILED',
          httpConnected: error instanceof ConnectClientError && error.httpConnected,
          dataValidationStatus: isInvalidResponse ? 'INVALID_RESPONSE' : 'NOT_CHECKED',
          errorCode,
          productsCount: diagnostic?.productsCount ?? null,
          validProductsCount:
            diagnostic?.productsCount === null ? null : (diagnostic?.validProductsCount ?? null),
          invalidProductsCount:
            diagnostic?.productsCount === null ? null : (diagnostic?.invalidProductsCount ?? null),
          pricingReady: false,
          responseTimeMs: Date.now() - startedAt,
          diagnostic,
        };
      }
    }
    const status =
      result.connectionStatus === 'CONNECTED_WITH_WARNINGS'
        ? 'WARNING'
        : result.success
          ? 'SUCCESS'
          : 'FAILED';
    await this.prisma.connectIntegrationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        lastHttpCheckAt: checkedAt,
        lastHttpCheckStatus: status,
        lastConnectionErrorCode: result.errorCode,
        lastSuccessfulCheckAt: result.success ? checkedAt : null,
      },
      update: {
        lastHttpCheckAt: checkedAt,
        lastHttpCheckStatus: status,
        lastConnectionErrorCode: result.errorCode,
        ...(result.success ? { lastSuccessfulCheckAt: checkedAt } : {}),
      },
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_HTTP_TEST',
      entityType: 'ConnectIntegrationSettings',
      entityId: SETTINGS_ID,
      ipAddress,
      after: {
        success: result.success,
        connectionStatus: result.connectionStatus,
        httpConnected: result.httpConnected,
        dataValidationStatus: result.dataValidationStatus,
        errorCode: result.errorCode,
        responseTimeMs: result.responseTimeMs,
        productsCount: result.productsCount,
        validProductsCount: result.validProductsCount,
        invalidProductsCount: result.invalidProductsCount,
        pricingReady: result.pricingReady,
        diagnostic: result.diagnostic,
      },
    });
    return {
      success: result.success,
      connectionStatus: result.connectionStatus,
      httpConnected: result.httpConnected,
      dataValidationStatus: result.dataValidationStatus,
      pricingReady: result.pricingReady,
      service: 'connect',
      method: 'http',
      responseTimeMs: result.responseTimeMs,
      productsCount: result.productsCount,
      validProductsCount: result.validProductsCount,
      invalidProductsCount: result.invalidProductsCount,
      checkedAt: checkedAt.toISOString(),
      errorCode: result.errorCode,
      diagnostic: result.diagnostic,
    };
  }

  async testWebSocket(actorId: string, ipAddress?: string) {
    const checkedAt = new Date();
    const row = await this.row();
    const status =
      row?.accessKeyEncrypted && row.accessSecretEncrypted ? 'DEFERRED' : 'NOT_CONFIGURED';
    await this.prisma.connectIntegrationSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        lastWebSocketCheckAt: checkedAt,
        lastWebSocketCheckStatus: status,
        lastConnectionErrorCode: status,
      },
      update: {
        lastWebSocketCheckAt: checkedAt,
        lastWebSocketCheckStatus: status,
        lastConnectionErrorCode: status,
      },
    });
    await this.audit.log({
      actorId,
      action: 'CONNECT_WEBSOCKET_TEST',
      entityType: 'ConnectIntegrationSettings',
      entityId: SETTINGS_ID,
      ipAddress,
      after: { success: false, errorCode: status },
    });
    return {
      success: false,
      service: 'connect',
      method: 'websocket',
      checkedAt: checkedAt.toISOString(),
      errorCode: status,
    };
  }

  async getStatus() {
    const row = await this.row();
    const view = this.toView(row);
    return {
      isEnabled: view.isEnabled,
      configured: view.accessKeyConfigured && view.accessSecretConfigured,
      accessKeyConfigured: view.accessKeyConfigured,
      accessSecretConfigured: view.accessSecretConfigured,
      lastHttpCheckAt: view.lastHttpCheckAt,
      lastHttpCheckStatus: view.lastHttpCheckStatus,
      lastWebSocketCheckAt: view.lastWebSocketCheckAt,
      lastWebSocketCheckStatus: view.lastWebSocketCheckStatus,
      lastSuccessfulCheckAt: view.lastSuccessfulCheckAt,
      lastConnectionErrorCode: view.lastConnectionErrorCode,
      connectionState: !view.isEnabled
        ? 'DISABLED'
        : !(view.accessKeyConfigured && view.accessSecretConfigured)
          ? 'NOT_CONFIGURED'
          : !view.lastHttpCheckAt
            ? 'NEVER_TESTED'
            : view.lastHttpCheckStatus === 'WARNING'
              ? 'LAST_TEST_WARNING'
              : view.lastHttpCheckStatus === 'SUCCESS'
                ? 'LAST_TEST_SUCCESS'
                : 'LAST_TEST_FAILED',
      liveConnected: false,
      priceSyncActive: false,
      tradingEnabled: view.externalExecutionFeatureGate,
      externalExecutionFeatureGate: view.externalExecutionFeatureGate,
    };
  }

  private row() {
    return this.prisma.connectIntegrationSettings.findUnique({ where: { id: SETTINGS_ID } });
  }
  private toView(row: Awaited<ReturnType<ConnectSettingsService['row']>>) {
    return {
      httpBaseUrl: row?.httpBaseUrl ?? DEFAULT_HTTP,
      websocketUrl: row?.websocketUrl ?? DEFAULT_WS,
      isEnabled: row?.isEnabled ?? false,
      priceSyncEnabled: row?.priceSyncEnabled ?? false,
      externalBuyEnabled: row?.externalBuyEnabled ?? false,
      externalSellEnabled: row?.externalSellEnabled ?? false,
      externalExecutionFeatureGate: row?.externalExecutionFeatureGate ?? false,
      accessKeyConfigured: Boolean(row?.accessKeyEncrypted),
      accessSecretConfigured: Boolean(row?.accessSecretEncrypted),
      webhookSecretConfigured: Boolean(row?.webhookSecretEncrypted),
      lastHttpCheckAt: row?.lastHttpCheckAt?.toISOString() ?? null,
      lastHttpCheckStatus: row?.lastHttpCheckStatus ?? null,
      lastWebSocketCheckAt: row?.lastWebSocketCheckAt?.toISOString() ?? null,
      lastWebSocketCheckStatus: row?.lastWebSocketCheckStatus ?? null,
      lastConnectionErrorCode: row?.lastConnectionErrorCode ?? null,
      lastSuccessfulCheckAt: row?.lastSuccessfulCheckAt?.toISOString() ?? null,
      createdAt: row?.createdAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }
  private auditView(row: Awaited<ReturnType<ConnectSettingsService['row']>>) {
    if (!row) return null;
    return {
      httpBaseUrl: row.httpBaseUrl,
      websocketUrl: row.websocketUrl,
      isEnabled: row.isEnabled,
      priceSyncEnabled: row.priceSyncEnabled,
      externalBuyEnabled: row.externalBuyEnabled,
      externalSellEnabled: row.externalSellEnabled,
      externalExecutionFeatureGate: row.externalExecutionFeatureGate,
      accessKeyConfigured: Boolean(row.accessKeyEncrypted),
      accessSecretConfigured: Boolean(row.accessSecretEncrypted),
      webhookSecretConfigured: Boolean(row.webhookSecretEncrypted),
    };
  }
}

function validateEndpoint(value: string, protocol: 'https:' | 'wss:') {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BadRequestException('نشانی اتصال معتبر نیست.');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    url.protocol !== protocol ||
    !ALLOWED_HOSTS.has(host) ||
    (url.port !== '' && url.port !== '443') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isIP(host)
  )
    throw new BadRequestException('فقط نشانی امن دامنه رسمی Connect مجاز است.');
  if (protocol === 'https:' && url.pathname !== '/' && url.pathname !== '')
    throw new BadRequestException('در نشانی پایه HTTP مسیر اضافی مجاز نیست.');
  return protocol === 'https:' ? `https://${host}` : `wss://${host}${url.pathname || '/ws'}`;
}

function safeErrorCode(error: unknown) {
  const code =
    error instanceof Error && 'code' in error
      ? String((error as Error & { code?: unknown }).code)
      : '';
  const allowed = new Set([
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
    'INVALID_RESPONSE_FORMAT',
    'INVALID_RESPONSE',
    'INVALID_PRODUCT',
    'INVALID_PRODUCTS_RESPONSE',
    'INVALID_PRODUCT_ID',
    'INVALID_PRODUCT_TITLE',
    'INVALID_BUY_PRICE',
    'INVALID_SELL_PRICE',
    'INVALID_PRODUCT_STATUS',
  ]);
  if (code === 'AUTHENTICATION_FAILED') return 'HTTP_401';
  if (code === 'ACCESS_FORBIDDEN') return 'HTTP_403';
  if (code === 'RATE_LIMITED') return 'HTTP_429';
  if (code === 'TIMEOUT') return 'CONNECTION_TIMEOUT';
  if (code === 'NETWORK_ERROR') return 'CONNECTION_FAILED';
  return allowed.has(code) ? code : 'CONNECTION_FAILED';
}
