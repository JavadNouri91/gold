import { SmsConnectionService } from './application/sms-connection.service';

describe('SmsConnectionService', () => {
  const config = {
    provider: 'hisms',
    apiBaseUrl: 'https://sms.example.org',
    username: 'CSkkrm',
    password: 'secret',
    originator: '50004597',
    senderLine: '50004597',
    apiKey: '',
    smsirBaseUrl: '',
    melipayamakBaseUrl: '',
    melipayamakPassword: '',
    otpTemplate: '',
    enabled: false,
    otpExpiresInSeconds: 120,
    otpResendCooldownSeconds: 60,
    otpMaxAttempts: 5,
    otpMaxPerHour: 5,
  };
  let settings: { resolveEffectiveConfig: jest.Mock; recordConnectionTest: jest.Mock };
  let provider: { getUserInfo: jest.Mock };
  let service: SmsConnectionService;

  beforeEach(() => {
    settings = {
      resolveEffectiveConfig: jest.fn().mockResolvedValue(config),
      recordConnectionTest: jest.fn(),
    };
    provider = { getUserInfo: jest.fn().mockResolvedValue({ success: true, credit: '1234' }) };
    service = new SmsConnectionService(settings as never, provider as never);
  });

  it('uses account info only, returns provider credit, and records the result', async () => {
    const result = await service.test('admin-1', '10.0.0.1');
    expect(provider.getUserInfo).toHaveBeenCalledWith(config);
    expect(result).toMatchObject({ success: true, status: 'connected', credit: '1234' });
    expect(settings.recordConnectionTest).toHaveBeenCalledWith(
      'admin-1',
      '10.0.0.1',
      expect.objectContaining({ success: true }),
    );
  });

  it('distinguishes provider authentication errors from unreachable service', async () => {
    provider.getUserInfo.mockResolvedValue({
      success: false,
      errorCode: -101,
      error: 'نام کاربری یا رمز عبور سرویس پیامک صحیح نیست.',
    });
    await expect(service.test('admin-1')).resolves.toMatchObject({
      status: 'disconnected',
      message: expect.stringContaining('نام کاربری'),
    });
  });

  it('does not call HiSMS when saved configuration is incomplete', async () => {
    settings.resolveEffectiveConfig.mockResolvedValue({ ...config, password: '', apiBaseUrl: '' });
    await expect(service.test('admin-1')).resolves.toMatchObject({
      success: false,
      status: 'incomplete',
    });
    expect(provider.getUserInfo).not.toHaveBeenCalled();
  });
});
