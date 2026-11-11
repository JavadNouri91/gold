import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ConnectSettingsService } from './application/connect-settings.service';
import type { ConnectProductValidationDiagnostic } from './domain/interfaces/connect-provider.port';

describe('ConnectSettingsService', () => {
  const row = {
    id: 'global',
    httpBaseUrl: 'https://connect.tala-app.ir',
    websocketUrl: 'wss://connect.tala-app.ir/ws',
    accessKeyEncrypted: null,
    accessSecretEncrypted: null,
    webhookSecretEncrypted: null,
    isEnabled: false,
    priceSyncEnabled: false,
    externalBuyEnabled: false,
    externalSellEnabled: false,
    lastHttpCheckAt: null,
    lastHttpCheckStatus: null,
    lastWebSocketCheckAt: null,
    lastWebSocketCheckStatus: null,
    lastConnectionErrorCode: null,
    lastSuccessfulCheckAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let prisma: any;
  let audit: any;
  let http: any;
  let service: ConnectSettingsService;

  beforeEach(() => {
    process.env.CONNECT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    prisma = {
      connectIntegrationSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create, update }: any) => ({
          ...row,
          ...(create ?? {}),
          ...(update ?? {}),
        })),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...row, ...data })),
      },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    http = {
      getProducts: jest.fn().mockResolvedValue({
        success: true,
        connectionStatus: 'CONNECTED_VALID',
        httpConnected: true,
        dataValidationStatus: 'VALID',
        productsCount: 2,
        validProductsCount: 2,
        invalidProductsCount: 0,
        pricingReady: false,
        diagnostic: {
          productsCount: 2,
          validProductsCount: 2,
          invalidProductsCount: 0,
          issuesTruncated: false,
          issues: [],
        },
        responseTimeMs: 12,
      }),
    };
    service = new ConnectSettingsService(prisma, audit, http);
  });

  afterEach(() => {
    delete process.env.CONNECT_ENCRYPTION_KEY;
  });

  it('encrypts credentials and never returns their values', async () => {
    const result = await service.update(
      { accessKey: 'secret-key', accessSecret: 'secret-value', webhookSecret: 'hook-value' },
      'admin',
    );
    const saved = prisma.connectIntegrationSettings.upsert.mock.calls[0][0].create;
    expect(saved.accessKeyEncrypted).not.toContain('secret-key');
    expect(saved.accessSecretEncrypted).not.toContain('secret-value');
    expect(saved.webhookSecretEncrypted).not.toContain('hook-value');
    expect(result).not.toHaveProperty('accessKey');
    expect(JSON.stringify(result)).not.toContain('secret-value');
  });

  it('keeps omitted secret fields during updates', async () => {
    prisma.connectIntegrationSettings.findUnique.mockResolvedValue({
      ...row,
      accessKeyEncrypted: 'ciphertext',
    });
    await service.update({ isEnabled: true }, 'admin');
    expect(
      prisma.connectIntegrationSettings.upsert.mock.calls[0][0].update.accessKeyEncrypted,
    ).toBe('ciphertext');
  });

  it('fails closed when the dedicated encryption key is unavailable', async () => {
    delete process.env.CONNECT_ENCRYPTION_KEY;
    await expect(
      service.update({ accessSecret: 'must-not-be-plaintext' }, 'admin'),
    ).rejects.toThrow('CONNECT_ENCRYPTION_KEY');
    expect(prisma.connectIntegrationSettings.upsert).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation to remove a secret and audits only its type', async () => {
    prisma.connectIntegrationSettings.findUnique.mockResolvedValue({
      ...row,
      accessKeyEncrypted: 'ciphertext',
      lastHttpCheckStatus: 'SUCCESS',
    });
    await expect(service.removeSecret('accessKey', false, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.connectIntegrationSettings.update).not.toHaveBeenCalled();

    await service.removeSecret('accessKey', true, 'admin');
    expect(prisma.connectIntegrationSettings.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accessKeyEncrypted: null, lastHttpCheckStatus: null }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ after: { secretType: 'accessKey' } }),
    );
  });

  it('rejects non-allowlisted or insecure endpoints', async () => {
    await expect(
      service.update({ httpBaseUrl: 'http://localhost:4000' }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.update({ websocketUrl: 'wss://example.org/ws' }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tests only GET products and records a sanitized response', async () => {
    const encrypted = await service.update(
      { accessKey: 'unique-test-access-key', accessSecret: 'unique-test-access-secret' },
      'admin',
    );
    prisma.connectIntegrationSettings.findUnique.mockResolvedValue({
      ...row,
      accessKeyEncrypted:
        prisma.connectIntegrationSettings.upsert.mock.calls[0][0].create.accessKeyEncrypted,
      accessSecretEncrypted:
        prisma.connectIntegrationSettings.upsert.mock.calls[0][0].create.accessSecretEncrypted,
    });
    const result = await service.testHttp('admin');
    expect(http.getProducts).toHaveBeenCalledWith(
      encrypted.httpBaseUrl,
      'unique-test-access-key',
      'unique-test-access-secret',
    );
    expect(result).toMatchObject({ success: true, method: 'http', productsCount: 2 });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('unique-test-access-key');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('unique-test-access-secret');
  });

  it('returns warning health and audits only sanitized product validation diagnostics', async () => {
    const diagnostic: ConnectProductValidationDiagnostic = {
      productsCount: 2,
      validProductsCount: 1,
      invalidProductsCount: 1,
      issuesTruncated: false,
      issues: [
        {
          index: 1,
          field: 'buy_price',
          expectedType: 'finite non-negative number',
          receivedType: 'string',
          errorCode: 'INVALID_BUY_PRICE',
        },
      ],
    };
    http.getProducts.mockResolvedValue({
      success: true,
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      httpConnected: true,
      dataValidationStatus: 'PARTIAL',
      productsCount: 2,
      validProductsCount: 1,
      invalidProductsCount: 1,
      pricingReady: false,
      diagnostic,
      responseTimeMs: 15,
    });
    await service.update({ accessKey: 'test-key', accessSecret: 'test-secret' }, 'admin');
    const encryptedSettings = prisma.connectIntegrationSettings.upsert.mock.calls[0][0].create;
    prisma.connectIntegrationSettings.findUnique.mockResolvedValue({
      ...row,
      accessKeyEncrypted: encryptedSettings.accessKeyEncrypted,
      accessSecretEncrypted: encryptedSettings.accessSecretEncrypted,
    });
    const result = await service.testHttp('admin');
    expect(result).toMatchObject({
      success: true,
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      dataValidationStatus: 'PARTIAL',
      pricingReady: false,
      errorCode: 'INVALID_BUY_PRICE',
      diagnostic,
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ diagnostic }) }),
    );
    expect(JSON.stringify(result)).not.toContain('test-secret');
    const lastUpsert =
      prisma.connectIntegrationSettings.upsert.mock.calls[
        prisma.connectIntegrationSettings.upsert.mock.calls.length - 1
      ][0];
    expect(lastUpsert.create.lastHttpCheckStatus).toBe('WARNING');
  });

  it('preserves transport error codes and distinguishes a connected invalid JSON response', async () => {
    await service.update({ accessKey: 'key', accessSecret: 'secret' }, 'admin');
    const saved = prisma.connectIntegrationSettings.upsert.mock.calls[0][0].create;
    prisma.connectIntegrationSettings.findUnique.mockResolvedValue({
      ...row,
      accessKeyEncrypted: saved.accessKeyEncrypted,
      accessSecretEncrypted: saved.accessSecretEncrypted,
    });
    const { ConnectClientError } = await import('./infrastructure/connect-http.client');
    http.getProducts.mockRejectedValueOnce(
      new ConnectClientError('HTTP_401', undefined, true),
    );
    const authResult = await service.testHttp('admin');
    expect(authResult).toMatchObject({
      connectionStatus: 'CONNECTION_FAILED',
      httpConnected: true,
      dataValidationStatus: 'NOT_CHECKED',
      errorCode: 'HTTP_401',
    });
    http.getProducts.mockRejectedValueOnce(
      new ConnectClientError('INVALID_JSON', undefined, true),
    );
    const jsonResult = await service.testHttp('admin');
    expect(jsonResult).toMatchObject({
      httpConnected: true,
      dataValidationStatus: 'INVALID_RESPONSE',
      errorCode: 'INVALID_JSON',
    });
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('secret');
  });

  it('does not perform a WebSocket connection in phase one', async () => {
    const result = await service.testWebSocket('admin');
    expect(result.errorCode).toBe('NOT_CONFIGURED');
    expect(http.getProducts).not.toHaveBeenCalled();
  });
});
