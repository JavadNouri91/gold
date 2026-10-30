import { BadRequestException } from '@nestjs/common';
import { SmsSettingsService, SMS_SETTING_ID } from './application/sms-settings.service';
import { RoutingSmsProvider } from './infrastructure/providers/routing-sms.provider';
import { decryptSecret, encryptSecret } from '../../common/crypto/secret-box';
import type { SmsSetting } from '@prisma/client';

/**
 * SMS settings unit tests.
 *
 *  1. No database row → every value comes from .env
 *  2. Database row wins over .env
 *  3. The API key is encrypted at rest and only ever returned masked
 *  4. Omitting apiKey keeps the stored secret; '' clears it
 *  5. mock is rejected in production
 *  6. reset deletes the row and the .env values apply again
 *  7. Sender line accepts Persian digits and rejects letters
 *  8. RoutingSmsProvider forwards the resolved config to the chosen provider
 */

const ENV_SMS = {
  provider: 'smsir',
  apiKey: 'env-api-key',
  senderLine: '3000111',
  smsirBaseUrl: 'https://api.sms.ir/v1',
  melipayamakBaseUrl: 'https://rest.payamak-panel.com/api/SendSMS',
  melipayamakPassword: '',
};

function row(overrides: Partial<SmsSetting> = {}): SmsSetting {
  return {
    id: SMS_SETTING_ID,
    provider: 'smsir',
    apiKeyEncrypted: null,
    senderLine: null,
    smsirBaseUrl: null,
    melipayamakBaseUrl: null,
    melipayamakPasswordEncrypted: null,
    updatedAt: new Date('2026-10-26T10:00:00.000Z'),
    updatedById: 'admin-1',
    ...overrides,
  };
}

describe('SmsSettingsService', () => {
  const originalEnv = process.env.NODE_ENV;
  let service: SmsSettingsService;
  let prisma: {
    smsSetting: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.SETTINGS_ENCRYPTION_KEY = 'unit-test-encryption-secret';

    prisma = {
      smsSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    audit = { log: jest.fn().mockResolvedValue({}) };

    const config = { get: jest.fn().mockReturnValue(ENV_SMS) };
    service = new SmsSettingsService(prisma as never, config as never, audit as never);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    jest.clearAllMocks();
  });

  it('falls back to the .env configuration when nothing is stored', async () => {
    const view = await service.getView();

    expect(view.provider).toBe('smsir');
    expect(view.senderLine).toBe('3000111');
    expect(view.apiKeySource).toBe('environment');
    expect(view.storedInDatabase).toBe(false);
    expect(view.apiKeyMasked).toContain('••••');
    expect(view.apiKeyMasked).not.toContain('env-api-key');
  });

  it('lets the stored row win over the .env values', async () => {
    prisma.smsSetting.findUnique.mockResolvedValue(
      row({ apiKeyEncrypted: encryptForTest('db-api-key'), senderLine: '3000999' }),
    );

    const view = await service.getView();

    expect(view.senderLine).toBe('3000999');
    expect(view.apiKeySource).toBe('database');
    expect(view.storedInDatabase).toBe(true);
  });

  it('encrypts the API key at rest and never returns the plaintext', async () => {
    const view = await service.update(
      { provider: 'smsir', apiKey: 'super-secret-key', senderLine: '3000123' },
      'admin-1',
      '127.0.0.1',
    );

    const written = prisma.smsSetting.upsert.mock.calls[0][0] as {
      create: { apiKeyEncrypted: string };
    };
    expect(written.create.apiKeyEncrypted).not.toContain('super-secret-key');
    expect(decryptSecret(written.create.apiKeyEncrypted)).toBe('super-secret-key');
    expect(view.apiKeyMasked).not.toContain('super-secret-key');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SMS_SETTINGS_CHANGED', entityId: SMS_SETTING_ID }),
    );
  });

  it('keeps the stored key when apiKey is omitted and clears it on an empty string', async () => {
    const existing = row({ apiKeyEncrypted: encryptForTest('kept-key') });
    prisma.smsSetting.findUnique.mockResolvedValue(existing);

    await service.update({ provider: 'smsir' }, 'admin-1');
    const kept = prisma.smsSetting.upsert.mock.calls[0][0] as {
      update: { apiKeyEncrypted: string | null };
    };
    expect(kept.update.apiKeyEncrypted).toBe(existing.apiKeyEncrypted);

    await service.update({ provider: 'smsir', apiKey: '' }, 'admin-1');
    const cleared = prisma.smsSetting.upsert.mock.calls[1][0] as {
      update: { apiKeyEncrypted: string | null };
    };
    expect(cleared.update.apiKeyEncrypted).toBeNull();
  });

  it('rejects the mock provider in production', async () => {
    process.env.NODE_ENV = 'production';

    await expect(service.update({ provider: 'mock' }, 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.smsSetting.upsert).not.toHaveBeenCalled();
  });

  it('normalizes Persian digits in the sender line and rejects letters', async () => {
    await service.update({ provider: 'smsir', senderLine: '۳۰۰۰۱۲۳' }, 'admin-1');
    const written = prisma.smsSetting.upsert.mock.calls[0][0] as {
      update: { senderLine: string };
    };
    expect(written.update.senderLine).toBe('3000123');

    await expect(
      service.update({ provider: 'smsir', senderLine: 'abc' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reset drops the row so the .env values apply again', async () => {
    prisma.smsSetting.findUnique.mockResolvedValue(row({ senderLine: '3000999' }));

    await service.resetToEnv('admin-1', '127.0.0.1');

    expect(prisma.smsSetting.deleteMany).toHaveBeenCalledWith({
      where: { id: SMS_SETTING_ID },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SMS_SETTINGS_RESET' }),
    );
  });
});

describe('RoutingSmsProvider', () => {
  it('sends through the provider and credentials resolved at call time', async () => {
    const config = {
      provider: 'melipayamak' as const,
      apiKey: 'user',
      senderLine: '3000',
      smsirBaseUrl: 'https://api.sms.ir/v1',
      melipayamakBaseUrl: 'https://rest.payamak-panel.com/api/SendSMS',
      melipayamakPassword: 'pass',
    };
    const settings = { resolveEffectiveConfig: jest.fn().mockResolvedValue(config) };
    const target = {
      providerName: 'melipayamak',
      send: jest.fn().mockResolvedValue({ success: true, providerReference: '42' }),
    };
    const factory = { forProvider: jest.fn().mockReturnValue(target) };

    const routing = new RoutingSmsProvider(settings as never, factory as never);
    const result = await routing.send('09120000000', 'hi');

    expect(factory.forProvider).toHaveBeenCalledWith('melipayamak');
    expect(target.send).toHaveBeenCalledWith('09120000000', 'hi', config);
    expect(result).toEqual({ success: true, providerReference: '42' });
  });
});

function encryptForTest(value: string): string {
  // Uses the same helper the service uses, so decryption round-trips.
  return encryptSecret(value);
}
