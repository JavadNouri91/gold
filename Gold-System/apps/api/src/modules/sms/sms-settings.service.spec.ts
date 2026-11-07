import { BadRequestException } from '@nestjs/common';
import { SmsSettingsService, SMS_SETTING_ID } from './application/sms-settings.service';
import { decryptSmsSecret, encryptSecret, encryptSmsSecret } from '../../common/crypto/secret-box';
import type { SmsSetting } from '@prisma/client';

function row(overrides: Partial<SmsSetting> = {}): SmsSetting {
  return {
    id: SMS_SETTING_ID,
    provider: 'hisms',
    apiKeyEncrypted: null,
    senderLine: '50004597',
    smsirBaseUrl: null,
    melipayamakBaseUrl: null,
    melipayamakPasswordEncrypted: null,
    apiBaseUrl: null,
    username: 'CSkkrm',
    passwordEncrypted: null,
    otpTemplate: null,
    enabled: false,
    otpExpiresInSeconds: 120,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    connectionTestedAt: null,
    connectionTestSuccess: null,
    connectionTestMessage: null,
    updatedAt: new Date('2026-11-07T10:00:00.000Z'),
    updatedById: 'admin-1',
    ...overrides,
  };
}

describe('SmsSettingsService', () => {
  let service: SmsSettingsService;
  const prisma = {
    smsEventSetting: { updateMany: jest.fn() },
    smsSetting: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.SMS_ENCRYPTION_KEY = 'dedicated-sms-key-with-at-least-32-chars';
    process.env.SETTINGS_ENCRYPTION_KEY = 'legacy-settings-key-with-at-least-32-chars';
    process.env.JWT_ACCESS_SECRET = 'jwt-test-key-with-at-least-32-characters';
    prisma.smsSetting.findUnique.mockResolvedValue(null);
    prisma.smsSetting.upsert.mockResolvedValue(undefined);
    prisma.smsSetting.deleteMany.mockResolvedValue({ count: 1 });
    prisma.smsEventSetting.updateMany.mockResolvedValue({ count: 1 });
    audit.log.mockResolvedValue({});
    service = new SmsSettingsService(
      prisma as never,
      { get: jest.fn().mockReturnValue({ provider: 'mock' }) } as never,
      audit as never,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('defaults to HiSMS disabled with the documented initial username and sender', async () => {
    const view = await service.getView();
    expect(view).toMatchObject({
      provider: 'hisms',
      username: 'CSkkrm',
      originator: '50004597',
      enabled: false,
      connectionStatus: 'incomplete',
    });
  });

  it('saves general settings while the OTP template is missing', async () => {
    const view = await service.update(
      {
        provider: 'hisms',
        apiBaseUrl: '',
        username: 'CSkkrm',
        originator: '۵۰۰۰۴۵۹۷',
        enabled: false,
      },
      'admin-1',
    );
    expect(view.otpTemplate).toBe('');
    expect(view.enabled).toBe(false);
    expect(prisma.smsSetting.upsert).toHaveBeenCalled();
  });

  it('invalidates custom-text capability tests when SMS provider settings change', async () => {
    await service.update(
      { provider: 'hisms', apiBaseUrl: 'https://sms.example.org' },
      'admin-1',
    );
    expect(prisma.smsEventSetting.updateMany).toHaveBeenCalledWith({
      where: { customTextVerifiedAt: { not: null } },
      data: { customTextVerifiedAt: null },
    });
  });

  it('encrypts passwords with the dedicated key and never returns/logs them', async () => {
    const view = await service.update(
      { provider: 'hisms', password: 'provider-secret', apiBaseUrl: 'https://sms.example.org' },
      'admin-1',
    );
    const write = prisma.smsSetting.upsert.mock.calls[0][0];
    expect(write.create.passwordEncrypted).not.toContain('provider-secret');
    expect(decryptSmsSecret(write.create.passwordEncrypted).value).toBe('provider-secret');
    expect(JSON.stringify(view)).not.toContain('provider-secret');
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain('provider-secret');
  });

  it('preserves an existing password when the password field is omitted', async () => {
    const saved = encryptSmsSecret('saved-secret');
    prisma.smsSetting.findUnique.mockResolvedValue(row({ passwordEncrypted: saved }));
    await service.update({ provider: 'hisms', username: 'CSkkrm' }, 'admin-1');
    const update = prisma.smsSetting.upsert.mock.calls[0][0].update;
    expect(update.passwordEncrypted).toBe(saved);
  });

  it('reads a legacy encrypted password and re-encrypts it with SMS_ENCRYPTION_KEY on save', async () => {
    const legacy = encryptSecret('old-secret');
    prisma.smsSetting.findUnique.mockResolvedValue(row({ passwordEncrypted: legacy }));
    expect((await service.getView()).passwordConfigured).toBe(true);
    await service.update({ provider: 'hisms' }, 'admin-1');
    const updated = prisma.smsSetting.upsert.mock.calls[0][0].update.passwordEncrypted;
    expect(updated).toMatch(/^sms1:/);
    expect(decryptSmsSecret(updated).value).toBe('old-secret');
  });

  it('allows an explicit password clear', async () => {
    prisma.smsSetting.findUnique.mockResolvedValue(
      row({ passwordEncrypted: encryptSmsSecret('saved') }),
    );
    await service.update({ provider: 'hisms', password: '' }, 'admin-1');
    expect(prisma.smsSetting.upsert.mock.calls[0][0].update.passwordEncrypted).toBeNull();
  });

  it.each([
    'http://127.0.0.1',
    'https://localhost',
    'https://user:pass@sms.example.org',
    'https://192.168.1.8',
  ])('rejects unsafe API URL %s', async (apiBaseUrl) => {
    await expect(
      service.update({ provider: 'hisms', apiBaseUrl }, 'admin-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes Persian sender digits and audits settings without secrets', async () => {
    await service.update({ provider: 'hisms', originator: '۵۰۰۰۴۵۹۷' }, 'admin-1', '127.0.0.1');
    const write = prisma.smsSetting.upsert.mock.calls[0][0];
    expect(write.create.senderLine).toBe('50004597');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SMS_SETTINGS_CHANGED' }),
    );
  });

  it('stores connection test outcome without provider credentials', async () => {
    await service.recordConnectionTest('admin-1', '127.0.0.1', {
      success: false,
      message: 'اتصال برقرار نیست.',
    });
    expect(prisma.smsSetting.upsert.mock.calls[0][0].update).toEqual(
      expect.objectContaining({ connectionTestSuccess: false }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SMS_CONNECTION_TEST' }),
    );
  });
});
