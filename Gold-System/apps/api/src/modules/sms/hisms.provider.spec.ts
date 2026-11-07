import {
  createPinnedLookup,
  HismsProvider,
  parseLosslessResponse,
} from './infrastructure/providers/hisms.provider';
import { SmsRuntimeConfig } from './infrastructure/providers/sms-provider.interface';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
}));

const config: SmsRuntimeConfig = {
  provider: 'hisms',
  apiKey: '',
  senderLine: '50004597',
  originator: '50004597',
  smsirBaseUrl: '',
  melipayamakBaseUrl: '',
  melipayamakPassword: '',
  apiBaseUrl: 'https://sms.example.org',
  username: 'CSkkrm',
  password: 'not-returned',
  otpTemplate: 'otp-template-code',
  enabled: true,
  otpExpiresInSeconds: 120,
  otpResendCooldownSeconds: 60,
  otpMaxAttempts: 5,
  otpMaxPerHour: 5,
};

describe('HiSMS V2 adapter', () => {
  let provider: HismsProvider;
  let request: jest.SpyInstance<unknown, unknown[]>;

  beforeEach(() => {
    provider = new HismsProvider();
    request = jest
      .spyOn(provider as unknown as { request: (...args: unknown[]) => unknown }, 'request')
      .mockImplementation((..._args: unknown[]) =>
        Promise.resolve({
          ok: true,
          body: { errorModel: { errorCode: 0 }, references: ['9876543211234567890123'] },
        }),
      );
  });
  afterEach(() => jest.restoreAllMocks());

  it('supports Node lookup callbacks with all:true while keeping the resolved IP pinned', () => {
    const callback = jest.fn();
    createPinnedLookup('95.142.235.140', 4)('panel.hisms.ir', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '95.142.235.140', family: 4 }]);
  });

  it('sends OTP through the parameterized V2 template with a single code parameter', async () => {
    const result = await provider.sendOtp('09123456789', '123456', 'REGISTRATION', config);
    expect(request).toHaveBeenCalledWith(
      config,
      'sendParameterizedMessage',
      JSON.stringify({
        username: 'CSkkrm',
        password: 'not-returned',
        template: 'otp-template-code',
        parameters: ['123456'],
        destinations: ['09123456789'],
      }),
    );
    expect(result).toMatchObject({ success: true, providerReference: '9876543211234567890123' });
  });

  it('uses the standard one-to-many endpoint for test SMS', async () => {
    await provider.send('09123456789', 'test text', config);
    expect(request).toHaveBeenCalledWith(
      config,
      'sendMessageOneToMany',
      JSON.stringify({
        username: 'CSkkrm',
        password: 'not-returned',
        originator: '50004597',
        content: 'test text',
        destinations: ['09123456789'],
      }),
    );
  });

  it('retrieves account info without sending an SMS and returns credit', async () => {
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({
        ok: true,
        body: { errorModel: { errorCode: 0 }, userInfo: { credit: '12345' } },
      }),
    );
    expect(await provider.getUserInfo(config)).toEqual({ success: true, credit: '12345' });
    expect(request).toHaveBeenCalledWith(
      config,
      'getUserInfo',
      JSON.stringify({ username: 'CSkkrm', password: 'not-returned' }),
    );
  });

  it('accepts a valid account response when optional credit is omitted', async () => {
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({ ok: true, body: { errorModel: { errorCode: 0 } } }),
    );
    await expect(provider.getUserInfo(config)).resolves.toEqual({ success: true });
  });

  it('maps authentication, IP whitelist, and insufficient-credit errors safely', async () => {
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({
        ok: false,
        error: 'نام کاربری یا رمز عبور سرویس پیامک صحیح نیست.',
        errorCode: -101,
      }),
    );
    expect(await provider.send('09123456789', 'test', config)).toMatchObject({
      success: false,
      errorCode: -101,
      error: expect.stringContaining('نام کاربری'),
    });
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({
        ok: false,
        error: 'آدرس IP سرور در پنل پیامک ثبت نشده است.',
        errorCode: -110,
      }),
    );
    expect(await provider.getUserInfo(config)).toMatchObject({
      success: false,
      errorCode: -110,
      error: expect.stringContaining('IP سرور'),
    });
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({ ok: false, error: 'اعتبار پنل پیامک کافی نیست.', errorCode: -104 }),
    );
    expect(await provider.send('09123456789', 'test', config)).toMatchObject({
      success: false,
      errorCode: -104,
    });
  });

  it('preserves large V2 Long identifiers as strings and maps delivery state codes', async () => {
    const parsed = parseLosslessResponse(
      '{"errorModel":{"errorCode":0},"references":[9876543211234567890123],"states":[{"id":9876543211234567890123,"state":2}]}',
    );
    expect(parsed.references?.[0]).toBe('9876543211234567890123');
    request.mockImplementation((..._args: unknown[]) =>
      Promise.resolve({ ok: true, body: parsed }),
    );
    await expect(provider.getMessageStatus(config, ['9876543211234567890123'])).resolves.toEqual({
      success: true,
      states: [{ id: '9876543211234567890123', state: 'DELIVERED' }],
    });
    expect(request).toHaveBeenCalledWith(
      config,
      'getMessageState',
      expect.stringContaining('9876543211234567890123'),
    );
  });

  it('returns incomplete when template is missing and service disabled', async () => {
    expect(
      await provider.sendOtp('09123456789', '123456', 'LOGIN', { ...config, otpTemplate: '' }),
    ).toMatchObject({ success: false });
    expect(
      await provider.sendOtp('09123456789', '123456', 'LOGIN', { ...config, enabled: false }),
    ).toMatchObject({ success: false });
    expect(request).not.toHaveBeenCalled();
  });

  it('maps network timeout and malformed provider JSON to safe results', async () => {
    request.mockRestore();
    const internals = provider as unknown as {
      postPinned: (...args: unknown[]) => Promise<string>;
      request: (...args: unknown[]) => Promise<{ ok: boolean; error?: string }>;
    };
    jest.spyOn(internals, 'postPinned').mockRejectedValue(new Error('socket timed out'));
    await expect(internals.request(config, 'getUserInfo', '{}')).resolves.toMatchObject({
      ok: false,
      error: 'ارتباط با سرویس پیامک برقرار نشد.',
    });
    (internals.postPinned as jest.Mock).mockResolvedValue('{invalid');
    await expect(internals.request(config, 'getUserInfo', '{}')).resolves.toMatchObject({
      ok: false,
      error: 'پاسخ سرویس پیامک معتبر نیست.',
    });
  });

  it('blocks a provider host that resolves to a private address', async () => {
    request.mockRestore();
    const dns = jest.requireMock('node:dns/promises') as { lookup: jest.Mock };
    dns.lookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const internals = provider as unknown as {
      request: (...args: unknown[]) => Promise<{ ok: boolean; error?: string }>;
    };
    await expect(internals.request(config, 'getUserInfo', '{}')).resolves.toMatchObject({
      ok: false,
      error: 'آدرس وب‌سرویس مجاز نیست.',
    });
  });
});
