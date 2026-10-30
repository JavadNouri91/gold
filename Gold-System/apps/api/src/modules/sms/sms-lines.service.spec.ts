import { SmsLinesService } from './application/sms-lines.service';
import type { SmsRuntimeConfig } from './infrastructure/providers/sms-provider.interface';

/**
 * Sender-line list unit tests.
 *
 *  1. mock provider → no external call, no lines
 *  2. melipayamak → explicitly unsupported
 *  3. missing key → asks for the key instead of calling out
 *  4. SMS.ir success → numeric lines coerced to strings, current line echoed
 *  5. invalid key (status 10) → provider message surfaced, no crash
 *  6. network failure → unavailable, never a rejected render
 *  7. the API key never leaks into the payload
 */

const BASE_CONFIG: SmsRuntimeConfig = {
  provider: 'smsir',
  apiKey: 'secret-key',
  senderLine: '30002108021796',
  smsirBaseUrl: 'https://api.sms.ir/v1',
  melipayamakBaseUrl: 'https://rest.payamak-panel.com/api/SendSMS',
  melipayamakPassword: '',
};

function serviceWith(config: Partial<SmsRuntimeConfig>) {
  const settings = {
    resolveEffectiveConfig: jest.fn().mockResolvedValue({ ...BASE_CONFIG, ...config }),
  };
  return { service: new SmsLinesService(settings as never), settings };
}

describe('SmsLinesService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('does not call the provider in mock mode', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({ provider: 'mock' });

    const result = await service.listLines();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.lines).toEqual([]);
  });

  it('reports melipayamak as unsupported', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({ provider: 'melipayamak' });

    const result = await service.listLines();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.message).toContain('SMS.ir');
  });

  it('asks for an API key instead of calling out when none is saved', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({ apiKey: '' });

    const result = await service.listLines();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.available).toBe(false);
    expect(result.message).toContain('کلید');
  });

  it('returns the panel lines as strings and echoes the current sender line', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, data: [30002108021796], message: 'موفق' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.listLines();

    expect(result.available).toBe(true);
    expect(result.lines).toEqual(['30002108021796']);
    expect(result.current).toBe('30002108021796');
    expect(result.provider).toBe('smsir');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('https://api.sms.ir/v1/line');
    expect((init.headers as Record<string, string>)['X-API-KEY']).toBe('secret-key');
  });

  it('surfaces an invalid-key response without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 10, data: null, message: 'کلید وب سرویس نامعتبر است' }),
    }) as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.listLines();

    expect(result.available).toBe(false);
    expect(result.message).toBe('کلید وب سرویس نامعتبر است');
  });

  it('degrades to unavailable when the provider is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.listLines();

    expect(result.available).toBe(false);
    expect(result.lines).toEqual([]);
    expect(result.message).toContain('ارتباط');
  });

  it('never returns the API key in the response payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 1, data: [123] }),
    }) as unknown as typeof fetch;
    const { service } = serviceWith({});

    const result = await service.listLines();

    expect(JSON.stringify(result)).not.toContain('secret-key');
  });
});
