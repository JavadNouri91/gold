import { connectSettingsApi } from '@/lib/api';

describe('Connect settings API client', () => {
  afterEach(() => {
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    jest.restoreAllMocks();
  });

  it('preserves sanitized product diagnostics from the standard API envelope', async () => {
    const diagnostic = {
      productsCount: 2,
      validProductsCount: 1,
      invalidProductsCount: 1,
      issuesTruncated: false,
      issues: [
        {
          index: 0,
          field: 'buy_price',
          expectedType: 'finite non-negative number',
          receivedType: 'string',
          errorCode: 'INVALID_BUY_PRICE',
        },
      ],
    };
    const response = {
      success: true,
      data: {
        success: true,
        method: 'http',
        connectionStatus: 'CONNECTED_WITH_WARNINGS',
        httpConnected: true,
        dataValidationStatus: 'PARTIAL',
        productsCount: 2,
        validProductsCount: 1,
        invalidProductsCount: 1,
        pricingReady: false,
        responseTimeMs: null,
        checkedAt: '2026-11-10T12:00:00.000Z',
        errorCode: 'INVALID_BUY_PRICE',
        diagnostic,
      },
    };
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => response,
      } as Response),
    });

    await expect(connectSettingsApi.testHttp()).resolves.toMatchObject({
      errorCode: 'INVALID_BUY_PRICE',
      diagnostic,
    });
  });
});
