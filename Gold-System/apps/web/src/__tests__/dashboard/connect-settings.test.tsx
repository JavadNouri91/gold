import { fireEvent, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ConnectSettingsPage } from '@/components/dashboard/connect-settings-page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({ useAuth: () => require('./auth-state').authState }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  connectSettingsApi: {
    get: jest.fn(),
    status: jest.fn(),
    update: jest.fn(),
    removeSecret: jest.fn(),
    testHttp: jest.fn(),
    testWebSocket: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { connectSettingsApi } = require('@/lib/api') as {
  connectSettingsApi: Record<string, jest.Mock>;
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConnectSettingsPage />
    </SWRConfig>,
  );
}

describe('Connect settings page', () => {
  beforeEach(() => {
    signIn([
      'connect.settings.read',
      'connect.settings.manage',
      'connect.connection.test',
      'connect.status.read',
    ]);
    connectSettingsApi.get.mockReset().mockResolvedValue({
      httpBaseUrl: 'https://connect.tala-app.ir',
      websocketUrl: 'wss://connect.tala-app.ir/ws',
      isEnabled: false,
      priceSyncEnabled: false,
      externalBuyEnabled: false,
      externalSellEnabled: false,
      accessKeyConfigured: true,
      accessSecretConfigured: false,
      webhookSecretConfigured: false,
      lastHttpCheckAt: null,
      lastHttpCheckStatus: null,
      lastWebSocketCheckAt: null,
      lastWebSocketCheckStatus: null,
      lastConnectionErrorCode: null,
      lastSuccessfulCheckAt: null,
    });
    connectSettingsApi.status.mockReset().mockResolvedValue({ connectionState: 'NOT_CONFIGURED' });
  });

  it('shows credential configured flags without exposing credential values', async () => {
    renderPage();
    expect(await screen.findByText('اطلاعات اتصال')).toBeInTheDocument();
    expect(screen.getByText('مقدار ذخیره‌شده نمایش داده نمی‌شود.')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('real-access-key')).not.toBeInTheDocument();
  });

  it('keeps external transaction controls disabled in phase one', async () => {
    renderPage();
    await screen.findByText('قابلیت‌های آینده');
    const futureTradeToggles = screen.getAllByRole('checkbox').slice(-2);
    expect(futureTradeToggles).toHaveLength(2);
    futureTradeToggles.forEach((toggle) => expect(toggle).toBeDisabled());
  });

  it('keeps WebSocket testing deferred and disabled', async () => {
    renderPage();
    const websocketTest = await screen.findByRole('button', { name: /WebSocket/ });
    expect(websocketTest).toBeDisabled();
  });

  it('shows a safe summary and field diagnostics for invalid products', async () => {
    connectSettingsApi.testHttp.mockResolvedValue({
      success: true,
      method: 'http',
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      httpConnected: true,
      dataValidationStatus: 'PARTIAL',
      productsCount: 21,
      validProductsCount: 18,
      invalidProductsCount: 3,
      pricingReady: false,
      checkedAt: '2026-11-10T12:00:00.000Z',
      errorCode: 'INVALID_BUY_PRICE',
      diagnostic: {
        productsCount: 21,
        validProductsCount: 18,
        invalidProductsCount: 3,
        issuesTruncated: false,
        issues: [
          {
            index: 3,
            field: 'buy_price',
            expectedType: 'finite non-negative number',
            receivedType: 'string',
            errorCode: 'INVALID_BUY_PRICE',
            reason: 'STRING_PRICE',
          },
        ],
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تست اتصال HTTP' }));
    expect(
      await screen.findByText(/۱۸ محصول معتبر و ۳ محصول نامعتبر از ۲۱ محصول/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText('جزئیات پالایش‌شده پاسخ'));
    expect(await screen.findByText(/قیمت خرید؛ انتظار/)).toBeInTheDocument();
    expect(screen.getByText(/علت: مقدار رشته‌ای است/)).toBeInTheDocument();
    expect(screen.queryByText('50000000')).not.toBeInTheDocument();
    expect(screen.getByText('اتصال برقرار؛ برخی محصولات نامعتبرند')).toBeInTheDocument();
    expect(
      screen.getByText(/آمادگی برای ورود به قیمت‌گذاری: غیرفعال در این فاز/),
    ).toBeInTheDocument();
  });

  it('shows all-invalid data as warning and never marks pricing ready', async () => {
    connectSettingsApi.testHttp.mockResolvedValue({
      success: true,
      method: 'http',
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      httpConnected: true,
      dataValidationStatus: 'INVALID',
      productsCount: 3,
      validProductsCount: 0,
      invalidProductsCount: 3,
      pricingReady: false,
      checkedAt: '2026-11-10T12:00:00.000Z',
      errorCode: 'INVALID_SELL_PRICE',
      diagnostic: {
        productsCount: 3,
        validProductsCount: 0,
        invalidProductsCount: 3,
        issuesTruncated: false,
        issues: [],
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تست اتصال HTTP' }));
    expect(
      await screen.findByText(/اعتبار داده‌ها: هیچ محصول معتبری وجود ندارد/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('آمادگی برای ورود به قیمت‌گذاری: غیرفعال در این فاز'),
    ).toBeInTheDocument();
  });

  it('shows fully valid data as green connection health', async () => {
    connectSettingsApi.testHttp.mockResolvedValue({
      success: true,
      method: 'http',
      connectionStatus: 'CONNECTED_VALID',
      httpConnected: true,
      dataValidationStatus: 'VALID',
      productsCount: 1,
      validProductsCount: 1,
      invalidProductsCount: 0,
      pricingReady: false,
      checkedAt: '2026-11-10T12:00:00.000Z',
      errorCode: null,
      diagnostic: {
        productsCount: 1,
        validProductsCount: 1,
        invalidProductsCount: 0,
        issuesTruncated: false,
        issues: [],
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تست اتصال HTTP' }));
    expect(await screen.findByText('اتصال برقرار؛ همه محصولات معتبر')).toBeInTheDocument();
    const statuses = screen.getAllByRole('status');
    expect(statuses[statuses.length - 1]).toHaveClass('border-emerald-200');
  });

  it('shows failed protocol validation as a red health state', async () => {
    connectSettingsApi.testHttp.mockResolvedValue({
      success: false,
      method: 'http',
      connectionStatus: 'CONNECTION_FAILED',
      httpConnected: true,
      dataValidationStatus: 'INVALID_RESPONSE',
      productsCount: null,
      validProductsCount: null,
      invalidProductsCount: null,
      pricingReady: false,
      checkedAt: '2026-11-10T12:00:00.000Z',
      errorCode: 'INVALID_PRODUCTS_RESPONSE',
      diagnostic: {
        productsCount: null,
        validProductsCount: 0,
        invalidProductsCount: 0,
        issuesTruncated: false,
        issues: [
          {
            index: null,
            field: 'data',
            expectedType: 'array',
            receivedType: 'null',
            errorCode: 'INVALID_PRODUCTS_RESPONSE',
          },
        ],
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تست اتصال HTTP' }));
    expect(await screen.findByText('اتصال یا اعتبارسنجی پاسخ ناموفق')).toBeInTheDocument();
    const statuses = screen.getAllByRole('status');
    expect(statuses[statuses.length - 1]).toHaveClass('border-red-200');
  });

  it('explains when an old backend omits product diagnostics', async () => {
    connectSettingsApi.testHttp.mockResolvedValue({
      success: false,
      method: 'http',
      checkedAt: '2026-11-10T12:00:00.000Z',
      errorCode: 'INVALID_PRODUCT',
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'تست اتصال HTTP' }));
    expect(await screen.findByText(/جزئیات تشخیصی در پاسخ Backend موجود نیست/)).toBeInTheDocument();
  });

  it('explains that a persisted status code has no field detail until HTTP is retested', async () => {
    connectSettingsApi.get.mockReset().mockResolvedValue({
      httpBaseUrl: 'https://connect.tala-app.ir',
      websocketUrl: 'wss://connect.tala-app.ir/ws',
      isEnabled: false,
      priceSyncEnabled: false,
      externalBuyEnabled: false,
      externalSellEnabled: false,
      accessKeyConfigured: true,
      accessSecretConfigured: true,
      webhookSecretConfigured: false,
      lastHttpCheckAt: '2026-11-10T12:00:00.000Z',
      lastHttpCheckStatus: 'FAILED',
      lastWebSocketCheckAt: null,
      lastWebSocketCheckStatus: null,
      lastConnectionErrorCode: 'INVALID_PRODUCT',
      lastSuccessfulCheckAt: null,
    });
    renderPage();
    expect(
      await screen.findByText(/جزئیات فیلد در کارت وضعیت اتصال موجود نیست/),
    ).toBeInTheDocument();
  });
});
