import { act, fireEvent, render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ConnectProductsPage } from '@/components/dashboard/connect-products-page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({ useAuth: () => require('./auth-state').authState }));
jest.mock('@/lib/api', () => ({
  ...jest.requireActual('@/lib/api'),
  connectProductsApi: {
    cashShadow: jest.fn(),
    selectCashReference: jest.fn(),
    setShadowDisplayMode: jest.fn(),
    shadowReference: jest.fn(),
    selectShadowReference: jest.fn(),
    setShadowMaxAge: jest.fn(),
    list: jest.fn(),
    syncStatus: jest.fn(),
    sync: jest.fn(),
    get: jest.fn(),
    getMapping: jest.fn(),
    saveMapping: jest.fn(),
    verifyMapping: jest.fn(),
    disableMapping: jest.fn(),
  },
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { connectProductsApi } = require('@/lib/api') as {
  connectProductsApi: Record<string, jest.Mock>;
};
const { ApiClientError } = require('@/lib/api') as { ApiClientError: new (code: string, message: string, status: number) => Error };

const sample = {
  id: 'local-product-1',
  externalProductId: 'remote-product-1',
  title: 'سکه',
  buyPrice: '1200',
  sellPrice: null,
  isActive: true,
  isBuyActive: true,
  isSellActive: false,
  validationStatus: 'PARTIAL',
  presenceStatus: 'SEEN',
  lastValidationErrors: [
    {
      index: 0,
      field: 'sell_price',
      receivedType: 'number',
      errorCode: 'INVALID_SELL_PRICE',
      reason: 'NEGATIVE_PRICE',
    },
  ],
  lastFetchedAt: '2026-11-10T12:00:00.000Z',
  lastValidAt: null,
  mapping: null,
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ConnectProductsPage />
    </SWRConfig>,
  );
}

describe('Connect products management page', () => {
  beforeEach(() => {
    signIn([
      'connect.products.read',
      'connect.products.sync',
      'connect.products.mapping.manage',
      'connect.products.mapping.verify',
    ]);
    connectProductsApi.list
      .mockReset()
      .mockResolvedValue({ items: [sample], page: 1, pageSize: 20, total: 1, pageCount: 1 });
    connectProductsApi.syncStatus.mockReset().mockResolvedValue({
      latest: null,
      counts: [{ validationStatus: 'PARTIAL', isActive: true, count: 1 }],
      totalCount: 1,
      mappedCount: 0,
      unmappedCount: 1,
    });
    connectProductsApi.shadowReference.mockReset().mockResolvedValue({
      status: 'NOT_READY',
      maxAgeSeconds: 300,
      reasons: ['PRICE_CONTRACT_UNRESOLVED'],
      currentReference: null,
      connectPrice: null,
      candidate: null,
    });
    connectProductsApi.cashShadow.mockReset().mockResolvedValue({ displayMode: 'BOTH', categories: [] });
    connectProductsApi.sync.mockReset().mockResolvedValue({
      success: true,
      status: 'WARNING',
      totalCount: 1,
      validCount: 0,
      invalidCount: 1,
      newCount: 1,
      updatedCount: 0,
      notSeenCount: 0,
      unpersistedInvalidIdCount: 0,
      issues: [
        {
          index: 0,
          field: 'sell_price',
          receivedType: 'number',
          errorCode: 'INVALID_SELL_PRICE',
          reason: 'NEGATIVE_PRICE',
        },
      ],
      issuesTruncated: false,
      responseTimeMs: 10,
      completedAt: '2026-11-10T12:00:00.000Z',
    });
  });

  it('shows catalog fields without assigning a currency to unmapped catalog prices', async () => {
    renderPage();
    expect(connectProductsApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 100 }));
    expect(await screen.findByText('سکه')).toBeInTheDocument();
    expect(screen.getByText('ناسازگار یا ناقص')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /سکه/ }));
    expect(await screen.findByText(/نوع داده number/)).toBeInTheDocument();
    expect(screen.getByText(/دلیل: قیمت منفی است/)).toBeInTheDocument();
    expect(screen.getByText(/واحد نامشخص/)).toBeInTheDocument();
    expect(screen.getByText(/قیمت Connect به تومان\/مثقال است/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید نگاشت' })).toBeDisabled();
  });

  it('runs only the manager initiated catalog sync and refreshes the catalog', async () => {
    renderPage();
    expect(connectProductsApi.sync).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /دریافت محصولات از Connect/ }));
    expect(await screen.findByText(/دریافت انجام شد/)).toBeInTheDocument();
    expect(screen.getByText(/جزئیات پالایش محصولات/)).toBeInTheDocument();
    expect(connectProductsApi.sync).toHaveBeenCalledTimes(1);
    expect(connectProductsApi.list).toHaveBeenCalledTimes(2);
  });

  it('localizes sync 429, prevents another attempt during the throttle window, and preserves catalog rows', async () => {
    connectProductsApi.sync.mockRejectedValueOnce(new ApiClientError('TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests', 429));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /دریافت محصولات از Connect/ }));

    expect(await screen.findByText(/درخواست همگام‌سازی اخیراً انجام شده است/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /دریافت مجدد پس از/ })).toBeDisabled();
    expect(screen.getByText('سکه')).toBeInTheDocument();
    expect(connectProductsApi.sync).toHaveBeenCalledTimes(1);
  });

  it('does not retry a catalog GET after 429 and keeps the prior list visible', async () => {
    connectProductsApi.list.mockReset()
      .mockResolvedValueOnce({ items: [sample], page: 1, pageSize: 100, total: 1, pageCount: 1 })
      .mockRejectedValueOnce(new ApiClientError('TOO_MANY_REQUESTS', 'ThrottlerException: Too Many Requests', 429));
    renderPage();
    expect(await screen.findByText('سکه')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('جست‌وجوی نام یا شناسهٔ محصول'), { target: { value: 'محصول جدید' } });

    expect(await screen.findByText('دریافت فهرست انجام نشد.')).toBeInTheDocument();
    expect(screen.getByText('سکه')).toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
    expect(connectProductsApi.list).toHaveBeenCalledTimes(2);
  });

  it('saves a mapping draft and keeps verification disabled until that draft exists', async () => {
    const validProduct = { ...sample, validationStatus: 'VALID', presenceStatus: 'SEEN' };
    connectProductsApi.list.mockResolvedValue({ items: [validProduct], page: 1, pageSize: 100, total: 1, pageCount: 1 });
    const savedMapping = {
      id: 'mapping-draft-1', internalAssetType: 'INTERNAL_GOLD_WEIGHT', cashPriceCategory: 'CASH_TOMORROW',
      internalGoldPurity: '0.750', externalQuantityUnit: 'MESGHAL', externalPriceCurrency: 'IRR',
      priceUnitBasis: 'PER_MESGHAL', conversionFactor: '4.3318', connectBuySide: null, connectSellSide: null, isVerified: false, isEnabled: false,
    };
    connectProductsApi.saveMapping.mockResolvedValue(savedMapping);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /سکه/ }));
    expect(screen.getByRole('button', { name: 'تأیید نگاشت' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/عیار نسبی/), { target: { value: '0.750' } });
    fireEvent.change(screen.getByLabelText(/واحد مقدار Connect/), { target: { value: 'MESGHAL' } });
    fireEvent.change(screen.getByLabelText(/واحد پول قیمت/), { target: { value: 'IRR' } });
    fireEvent.change(screen.getByLabelText(/مبنای قیمت/), { target: { value: 'PER_MESGHAL' } });
    fireEvent.change(screen.getByLabelText(/ضریب تبدیل/), { target: { value: '4.3318' } });
    fireEvent.change(screen.getByLabelText(/دستهٔ قیمت نقد/), { target: { value: 'CASH_TOMORROW' } });
    fireEvent.change(screen.getByLabelText(/نوع دارایی داخلی/), { target: { value: 'INTERNAL_GOLD_WEIGHT' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پیش‌نویس/ }));

    expect(await screen.findByText(/پیش‌نویس نگاشت ذخیره شد/)).toBeInTheDocument();
    expect(connectProductsApi.saveMapping).toHaveBeenCalledWith('local-product-1', expect.objectContaining({
      internalAssetType: 'INTERNAL_GOLD_WEIGHT', cashPriceCategory: 'CASH_TOMORROW', internalGoldPurity: '0.750',
      externalQuantityUnit: 'MESGHAL', externalPriceCurrency: 'IRR', priceUnitBasis: 'PER_MESGHAL', conversionFactor: '4.3318',
    }));
    expect(screen.getByRole('button', { name: 'تأیید نگاشت' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('جهت قیمت خرید Connect'), { target: { value: 'INTERNAL_BUY' } });
    fireEvent.change(screen.getByLabelText('جهت قیمت فروش Connect'), { target: { value: 'INTERNAL_SELL' } });
    expect(screen.getByRole('button', { name: 'تأیید نگاشت' })).toBeEnabled();
    expect(connectProductsApi.list).toHaveBeenCalledTimes(2);
  });

  it('verifies a complete mapping once, keeps enablement off, and refreshes the catalog status', async () => {
    const verifiedMapping = {
      id: 'mapping-1', internalAssetType: 'INTERNAL_GOLD_WEIGHT', cashPriceCategory: 'CASH_TOMORROW',
      internalGoldPurity: '0.750', externalQuantityUnit: 'MESGHAL', externalPriceCurrency: 'TOMAN',
      priceUnitBasis: 'PER_MESGHAL', conversionFactor: '4.3318', connectBuySide: 'INTERNAL_BUY',
      connectSellSide: 'INTERNAL_SELL', isVerified: true, isEnabled: false,
    };
    const product = { ...sample, validationStatus: 'VALID', presenceStatus: 'SEEN', mapping: { ...verifiedMapping, isVerified: false } };
    const verifiedProduct = { ...product, mapping: verifiedMapping };
    connectProductsApi.list
      .mockResolvedValueOnce({ items: [product], page: 1, pageSize: 100, total: 1, pageCount: 1 })
      .mockResolvedValue({ items: [verifiedProduct], page: 1, pageSize: 100, total: 1, pageCount: 1 });
    connectProductsApi.verifyMapping.mockResolvedValue(verifiedMapping);
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /سکه/ }));
    const verifyButton = screen.getByRole('button', { name: 'تأیید نگاشت' });
    expect(verifyButton).toBeEnabled();

    fireEvent.click(verifyButton);
    fireEvent.click(verifyButton);

    expect(await screen.findByText('نگاشت تأیید شد؛ وضعیت فعال‌سازی همچنان مستقل و خاموش است.')).toBeInTheDocument();
    expect(connectProductsApi.verifyMapping).toHaveBeenCalledTimes(1);
    expect(connectProductsApi.list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('تأییدشده')).toBeInTheDocument();
    expect(verifyButton).toBeDisabled();
  });

  it('shows Persian verification errors and leaves the mapping draft state intact', async () => {
    const draft = { ...sample, validationStatus: 'VALID', presenceStatus: 'SEEN', mapping: {
      id: 'mapping-1', internalAssetType: 'INTERNAL_GOLD_WEIGHT', cashPriceCategory: 'CASH_TOMORROW',
      internalGoldPurity: '0.750', externalQuantityUnit: 'MESGHAL', externalPriceCurrency: 'TOMAN',
      priceUnitBasis: 'PER_MESGHAL', conversionFactor: '4.3318', connectBuySide: 'INTERNAL_BUY',
      connectSellSide: 'INTERNAL_SELL', isVerified: false, isEnabled: false,
    } };
    connectProductsApi.list.mockResolvedValue({ items: [draft], page: 1, pageSize: 100, total: 1, pageCount: 1 });
    connectProductsApi.verifyMapping.mockRejectedValue(new ApiClientError('BAD_REQUEST', 'جهت قیمت معتبر نیست.', 400));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /سکه/ }));
    fireEvent.click(screen.getByRole('button', { name: 'تأیید نگاشت' }));

    expect(await screen.findByText('جهت قیمت معتبر نیست.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید نگاشت' })).toBeEnabled();
  });

  it('restores persisted draft fields when the catalog is loaded again after refresh', async () => {
    const persisted = {
      id: 'mapping-draft-1', internalAssetType: 'INTERNAL_GOLD_WEIGHT', cashPriceCategory: 'CASH_TOMORROW',
      internalGoldPurity: '0.750000', externalQuantityUnit: 'MESGHAL', externalPriceCurrency: 'IRR',
      priceUnitBasis: 'PER_MESGHAL', conversionFactor: '4.3318000000', isVerified: false, isEnabled: false,
    };
    connectProductsApi.list.mockResolvedValue({
      items: [{ ...sample, validationStatus: 'VALID', presenceStatus: 'SEEN', mapping: persisted }],
      page: 1, pageSize: 100, total: 1, pageCount: 1,
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /سکه/ }));

    expect(screen.getByLabelText(/عیار نسبی/)).toHaveValue('0.750000');
    expect(screen.getByLabelText(/واحد مقدار Connect/)).toHaveValue('MESGHAL');
    expect(screen.getByLabelText(/واحد پول قیمت/)).toHaveValue('IRR');
    expect(screen.getByLabelText(/مبنای قیمت/)).toHaveValue('PER_MESGHAL');
    expect(screen.getByLabelText(/ضریب تبدیل/)).toHaveValue('4.3318000000');
    expect(screen.getByLabelText(/دستهٔ قیمت نقد/)).toHaveValue('CASH_TOMORROW');
  });

  it('shows separate cash references with historical prices visibly marked as historical', async () => {
    connectProductsApi.cashShadow.mockResolvedValueOnce({
      displayMode: 'BOTH',
      categories: [
        { category: 'CASH_SPOT', label: 'نقد حاضر', displayMode: 'BOTH', historicalOnly: true,
          product: { title: 'محصول نمونه', externalProductId: 'cash-1', availability: 'NOT_SEEN', lastValidAt: '2026-11-10T12:00:00.000Z' },
          sides: { buy: { providerActive: false, providerActivityMeaning: 'UNCONFIRMED', supplierDirection: 'BUY_FROM_SUPPLIER', rawMesghalPriceToman: '43318', gram18PriceToman: null, gram18PriceRial: null, comparison: null, reasons: [] }, sell: { providerActive: true, providerActivityMeaning: 'UNCONFIRMED', supplierDirection: 'SELL_TO_SUPPLIER', rawMesghalPriceToman: null, gram18PriceToman: null, gram18PriceRial: null } }, status: 'UNAVAILABLE', reasons: ['PRODUCT_NOT_SEEN'] },
        { category: 'CASH_TOMORROW', label: 'نقد فردا', displayMode: 'BOTH', historicalOnly: false,
          product: { title: 'نقد فردا', externalProductId: 'cash-tomorrow', availability: 'AVAILABLE', lastFetchedAt: '2026-11-11T12:00:00.000Z', lastValidAt: '2026-11-11T12:00:00.000Z', mapping: { currency: 'TOMAN', quantityUnit: 'MESGHAL', priceBasis: 'PER_MESGHAL', purity: '0.750', conversionFactor: '4.3318', isVerified: true } },
          internalReference: { value: '265290000', unit: 'IRR_PER_GRAM', currency: 'IRR', purityReference: 'MOCK', fresh: true, contractVerified: false },
          sides: { buy: { supplierDirection: 'BUY_FROM_SUPPLIER', rawMesghalPriceToman: '43318', gram18PriceToman: '10000', gram18PriceRial: '100000', conversionReady: true, comparisonReady: false, comparison: null, reasons: [] }, sell: { supplierDirection: 'SELL_TO_SUPPLIER', rawMesghalPriceToman: '86636', gram18PriceToman: '20000', gram18PriceRial: '200000', conversionReady: true, comparisonReady: false, comparison: null, reasons: [] } }, status: 'READY', conversionReady: true, comparisonReady: false, reasons: ['INTERNAL_PRICE_CONTRACT_UNCONFIRMED'] },
        { category: 'CASH_DAY_AFTER_TOMORROW', label: 'نقد پس‌فردا', displayMode: 'BOTH', historicalOnly: false, product: null, sides: {}, status: 'NOT_READY', reasons: [] },
      ],
    });
    const rendered = renderPage();
    expect(await screen.findByText('نقد حاضر')).toBeInTheDocument();
    expect(screen.getByText('نقد فردا')).toBeInTheDocument();
    expect(screen.getByText('نقد پس‌فردا')).toBeInTheDocument();
    expect(screen.getAllByText(/خرید از بالادستی، مثقال:.*تاریخی، نه زنده/)).toHaveLength(2);
    expect(screen.getByText(/آخرین فهرست تأمین‌کننده موجود نیست/)).toBeInTheDocument();
    expect(rendered.container.textContent).toContain('۴۳٬۳۱۸');
    expect(rendered.container.textContent).toContain('۸۶٬۶۳۶');
    expect(rendered.container.textContent).toContain('۱۰٬۰۰۰');
    expect(rendered.container.textContent).toContain('۲۰٬۰۰۰');
    expect(screen.getByText(/عیار مرجع: MOCK/)).not.toBeVisible();
  });
});
