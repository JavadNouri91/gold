import { BadGatewayException } from '@nestjs/common';
import { SmsCreditService } from './application/sms-credit.service';
import type { SmsRuntimeConfig } from './infrastructure/providers/sms-provider.interface';

/**
 * SMS credit unit tests.
 *
 *  1. mock provider → no external call, credit reported unavailable
 *  2. melipayamak → explicitly unsupported instead of a fake number
 *  3. SMS.ir success → numeric credit surfaced
 *  4. SMS.ir status 10 (invalid key) → unavailable with the provider message
 *  5. HTTP failure → BadGatewayException, never a silent null
 *  6. the API key is only ever sent to the provider, never echoed back
 */

const BASE_CONFIG: SmsRuntimeConfig = {
  provider: 'smsir',
  apiKey: 'secret-key',
  senderLine: '3000',
  smsirBaseUrl: 'https://api.sms.ir/v1',
  melipayamakBaseUrl: 'https://rest.payamak-panel.com/api/SendSMS',
  melipayamakPassword: '',
};

function serviceWith(config: Partial<SmsRuntimeConfig>) {
  const settings = {
    resolveEffectiveConfig: jest.fn().mockResolvedValue({ ...BASE_CONFIG, ...config }),
  };
  return { service: new SmsCreditService(settings as never), settings };
}

describe('SmsCreditService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('does not call the provider in mock mode', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({ provider: 'mock' });

    const result = await service.getCredit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.credit).toBeNull();
  });

  it('reports melipayamak as unsupported rather than inventing a value', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({ provider: 'melipayamak' });

    const result = await service.getCredit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.message).toContain('SMS.ir');
  });

  it('returns the numeric credit for a successful SMS.ir call', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, data: 391.42, message: 'موفق' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.getCredit();

    expect(result.available).toBe(true);
    expect(result.credit).toBe(391.42);
    expect(result.provider).toBe('smsir');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sms.ir/v1/credit');
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe('secret-key');
  });

  it('surfaces an invalid-key response without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 10, data: null, message: 'کلید وب سرویس نامعتبر است' }),
    }) as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.getCredit();

    expect(result.available).toBe(false);
    expect(result.credit).toBeNull();
    expect(result.message).toBe('کلید وب سرویس نامعتبر است');
  });

  it('throws BadGatewayException on an HTTP error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }) as unknown as typeof fetch;
    const { service } = serviceWith({});

    await expect(service.getCredit()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('never returns the API key in the response payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, data: 5 }),
    }) as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.getCredit();

    expect(JSON.stringify(result)).not.toContain('secret-key');
  });
});
