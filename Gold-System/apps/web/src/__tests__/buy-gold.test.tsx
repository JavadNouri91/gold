import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { BuyGoldPage } from '../components/portal/buy-gold/buy-gold-page';
import { ApiClientError, type CurrentPrice, type CustomerAccount, type CustomerProfile, type Order, type PricingCalculationResult } from '../lib/api';
import { toPersianDigits } from '../lib/utils';

const mockPush = jest.fn();
const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockGetPrice = jest.fn();
const mockCalculate = jest.fn();
const mockCreate = jest.fn();
const mockSubmit = jest.fn();
const mockPortfolio = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/portal/orders/new',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api');
  return {
    ...actual,
    customerApi: {
      getMe: (...args: unknown[]) => mockGetMe(...args),
      getMyAccount: (...args: unknown[]) => mockGetAccount(...args),
    },
    pricingApi: {
      getCurrentPrice: (...args: unknown[]) => mockGetPrice(...args),
      calculate: (...args: unknown[]) => mockCalculate(...args),
    },
    ordersApi: {
      create: (...args: unknown[]) => mockCreate(...args),
      submit: (...args: unknown[]) => mockSubmit(...args),
      portfolio: (...args: unknown[]) => mockPortfolio(...args),
    },
  };
});

function price(snapshotId = 'snap-1', expiresAt?: string): CurrentPrice {
  return {
    snapshotId,
    normalizedValue: '12350000.00',
    unit: 'IRR/g',
    capturedAt: new Date().toISOString(),
    validityStatus: 'VALID',
    expiresAt: expiresAt ?? new Date(Date.now() + 120_000).toISOString(),
    ttlSeconds: 300,
  };
}

const customer: CustomerProfile = {
  id: 'c1',
  customerNumber: 'C-1',
  firstName: 'علی',
  lastName: 'رضایی',
  mobile: '09120000000',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  type: 'HOUSEHOLD',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function account(available = '500000000.00'): CustomerAccount {
  return {
    id: 'a1',
    customerId: 'c1',
    status: 'ACTIVE',
    creditLimitRial: '500000000.00',
    reservedCreditRial: '0.00',
    consumedCreditRial: '0.00',
    creditLimitGoldRial: '0.00',
    reservedCreditGoldRial: '0.00',
    consumedCreditGoldRial: '0.00',
    availableCreditRial: available,
  };
}

function calculation(snapshotId = 'snap-1'): PricingCalculationResult {
  return {
    calculationId: 'calc-1',
    isComplete: false,
    blockedSteps: [],
    pipeline: {
      step1_basePrice: '12350000.00',
      step2_afterGlobalAdj: '12350000.00',
      step3_purityConv: 'DEFERRED',
      step4_afterWeight: '61750000.00',
      step5_afterGroupRule: '61750000.00',
      wageAmount: '0.00',
      profitAmount: null,
      taxAmount: null,
      discountAmount: '0.00',
      priceBeforeRounding: '61750000.00',
      roundingAmount: '0.00',
      finalPrice: '61750000.00',
    },
    charges: [],
    goldCommercialRial: '61750000.00',
    feeTotalRial: '0.00',
    customerTotalRial: '61750000.00',
    payableRial: '61750000.00',
    receivableRial: null,
    side: 'BUY',
    meta: {
      snapshotId,
      globalAdjId: null,
      pricingRuleId: null,
      weightGrams: '5.000000',
      purityRatio: '0.750000',
      customerType: 'HOUSEHOLD',
    },
  };
}

const submitted: Order = {
  id: 'order-1',
  orderNumber: 'ORD-000125',
  customerId: 'c1',
  status: 'QUOTED',
  totalAmountRial: '61750000.00',
  weightGrams: '5.000000',
  purityRatio: '0.750000',
  reservedAmountRial: '61750000.00',
  step1BasePrice: '12350000.00',
  createdAt: '2026-09-29T12:00:00.000Z',
};

function renderPage(side: 'buy' | 'sell' = 'buy') {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BuyGoldPage side={side} />
    </SWRConfig>,
  );
}

async function calculateFiveGrams() {
  await screen.findByText(/۱,۲۳۵,۰۰۰/);
  fireEvent.click(screen.getByRole('button', { name: '۵ گرم' }));
  await screen.findAllByText('مبلغ قابل پرداخت');
}

async function openConfirm(side: 'buy' | 'sell' = 'buy') {
  const cta = side === 'sell' ? 'تأیید و فروش طلا' : 'تأیید و خرید طلا';
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: cta }));
  await screen.findByRole('dialog');
  const confirmButtons = screen.getAllByRole('button', { name: cta });
  return confirmButtons[confirmButtons.length - 1]!;
}

function calculationFromBody(body: { weightGrams?: string; side?: string }): PricingCalculationResult {
  const base = calculation();
  const raw = String(body.weightGrams ?? '5');
  const [intPart = '0', frac = ''] = raw.split('.');
  const milli = Number(intPart) * 1000 + Number((frac + '000').slice(0, 3));
  const final = String(milli * 12_350);
  const amount = `${final}.00`;
  const side = body.side === 'SELL' ? 'SELL' : 'BUY';
  return {
    ...base,
    pipeline: {
      ...base.pipeline,
      step4_afterWeight: amount,
      step5_afterGroupRule: amount,
      priceBeforeRounding: amount,
      finalPrice: amount,
    },
    charges: [],
    goldCommercialRial: amount,
    feeTotalRial: '0.00',
    customerTotalRial: amount,
    payableRial: side === 'BUY' ? amount : null,
    receivableRial: side === 'SELL' ? amount : null,
    side,
    meta: {
      ...base.meta,
      weightGrams: frac ? raw : `${raw}.000000`,
    },
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetMe.mockReset();
  mockGetAccount.mockReset();
  mockGetPrice.mockReset();
  mockCalculate.mockReset();
  mockCreate.mockReset();
  mockSubmit.mockReset();
  mockPortfolio.mockReset();
  mockGetMe.mockResolvedValue(customer);
  mockGetAccount.mockResolvedValue(account());
  mockGetPrice.mockResolvedValue(price());
  mockCalculate.mockImplementation(async (body: { weightGrams?: string; side?: string }) =>
    calculationFromBody(body),
  );
  mockCreate.mockResolvedValue({ ...submitted, status: 'DRAFT' });
  mockSubmit.mockResolvedValue(submitted);
  mockPortfolio.mockResolvedValue({
    weightGrams: '2.000000',
    purityRatio: '0.750000',
    averageBuyPriceRial: '12350000',
    totalBuyValueRial: '24700000',
    totalSellValueRial: null,
  });
});

describe('BuyGoldPage', () => {
  it('calculates from the pricing API and creates an order without sending a client total', async () => {
    renderPage();
    expect(await screen.findByRole('tab', { name: 'خرید طلا' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('قیمت لحظه‌ای طلای آبشده')).toBeInTheDocument();
    await calculateFiveGrams();

    expect(mockCalculate).toHaveBeenCalledWith(
      expect.objectContaining({
        weightGrams: '5',
        purityRatio: '0.750000',
        priceSnapshotId: 'snap-1',
        customerType: 'HOUSEHOLD',
      }),
    );
    expect(screen.getByText('قیمت لحظه سفارش')).toBeInTheDocument();
    expect(screen.queryByText('مالیات')).not.toBeInTheDocument();
    expect(screen.queryByText('اجرت')).not.toBeInTheDocument();

    const confirm = await openConfirm();
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await screen.findByRole('status');
    expect(screen.getByText('سفارش خرید ثبت شد')).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('ORD-000125'))).toBeInTheDocument();
    expect(screen.getByText('در حال بررسی')).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      weightGrams: '5',
      purityRatio: '0.750000',
      priceSnapshotId: 'snap-1',
      side: 'BUY',
    });
    expect(mockSubmit).toHaveBeenCalledWith('order-1');
    expect(JSON.stringify(mockCreate.mock.calls[0]?.[0])).not.toContain('61750000');
  });

  it('shows the transaction fee once on the invoice', async () => {
    mockCalculate.mockImplementation(async (body: { weightGrams?: string; side?: string }) => {
      const result = calculationFromBody(body);
      return {
        ...result,
        charges: [
          {
            code: 'BUY_FEE',
            labelFa: 'کارمزد خرید',
            side: 'BUY',
            mode: 'FIXED',
            rateValue: '21555.00',
            calculationBase: null,
            baseAmount: result.goldCommercialRial,
            amount: '21555.00',
          },
        ],
        feeTotalRial: '21555.00',
      };
    });
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();

    const label = screen.getByText('کارمزد خرید (مبلغ ثابت)');
    const value = label.parentElement?.querySelector('dd')?.textContent ?? '';
    expect(value).toBe(`${toPersianDigits('2,155')} تومان`);
    expect(value).not.toContain('.');
    expect(value.match(/کارمزد/g) ?? []).toHaveLength(0);
    expect(screen.getByText('مبلغ طلا')).toBeInTheDocument();
  });

  it('blocks submission when identity is not active', async () => {
    mockGetMe.mockResolvedValue({ ...customer, status: 'PENDING' });
    renderPage();
    expect(await screen.findByText('احراز هویت تکمیل نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تکمیل احراز هویت' })).toHaveAttribute('href', '/portal/kyc');
    expect(screen.getByRole('button', { name: 'تأیید و خرید طلا' })).toBeDisabled();
  });

  it('shows a shortfall when credit cannot cover the calculated total', async () => {
    mockGetAccount.mockResolvedValue(account('1000.00'));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    expect(screen.queryByText('روش پرداخت')).not.toBeInTheDocument();
    expect(screen.getByText('ارزش این وزن از دارایی ریالی شما بیشتر است.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'تأیید و خرید طلا' })).toBeDisabled();
  });

  it('keeps the reviewed price when the live snapshot changes', async () => {
    mockGetPrice.mockResolvedValueOnce(price('snap-1')).mockResolvedValue(price('snap-2'));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    fireEvent.click(screen.getByRole('button', { name: 'بروزرسانی قیمت' }));
    expect(await screen.findByText('قیمت طلا تغییر کرده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و خرید طلا' })).toBeDisabled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('disables confirmation when the snapshot TTL has passed', async () => {
    mockGetPrice.mockResolvedValue(price('snap-1', new Date(Date.now() - 1000).toISOString()));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    expect(screen.getByText('قیمت این سفارش منقضی شده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و خرید طلا' })).toBeDisabled();
  });

  it('prices the opposite panel while the weight is typed', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.change(screen.getByLabelText('وزن طلا (گرم)'), { target: { value: '۲' } });
    expect((await screen.findAllByText('مبلغ قابل پرداخت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '2' }));
    expect(screen.queryByRole('button', { name: 'محاسبه قیمت' })).not.toBeInTheDocument();
    expect(await screen.findByDisplayValue('۲,۴۷۰,۰۰۰')).toBeInTheDocument();
  });

  it('fills weight when a custom toman amount is typed', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '۲۰۰۰۰۰۰۰' } });
    expect(await screen.findByDisplayValue('۱۶.۱۹۴')).toBeInTheDocument();
    expect((await screen.findAllByText('مبلغ قابل پرداخت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1' }));
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '16.194' }));
  });

  it('moves the balance slider to buy from available credit and follows typed weight', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    const slider = await screen.findByLabelText('میزان خرید از مانده');
    expect(slider).toHaveAttribute('max', '50000000');
    fireEvent.change(slider, { target: { value: '20000000' } });
    expect(await screen.findByDisplayValue('۱۶.۱۹۴')).toBeInTheDocument();
    expect(slider).toHaveValue('20000000');
    expect(screen.getByText('۴۰٪')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('وزن طلا (گرم)'), { target: { value: '۲' } });
    expect(await screen.findByDisplayValue('۲,۴۷۰,۰۰۰')).toBeInTheDocument();
    expect(await screen.findByLabelText('میزان خرید از مانده')).toHaveValue('2470000');
  });

  it('fills buy weight from a fifth of available credit', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    expect(screen.getByText('مبلغ سریع (تومان)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '۱۰ میلیون' })).toBeInTheDocument();
    const chip = await screen.findByRole('button', { name: '۲۰ میلیون' });
    expect(screen.getByRole('button', { name: '۳۰ میلیون' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '۴۰ میلیون' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '۵۰ میلیون' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '۱۰۰ میلیون' })).not.toBeInTheDocument();
    fireEvent.click(chip);
    expect(await screen.findByDisplayValue('۱۶.۱۹۴')).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect((await screen.findAllByText('مبلغ قابل پرداخت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1' }));
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '16.194' }));
  });

  it('fills the weight that spends the whole rial balance', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.click(screen.getByRole('button', { name: 'خرید با همه دارایی ریالی' }));
    expect(await screen.findByDisplayValue('۴۰.۴۸۵')).toBeInTheDocument();
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1' }));
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '40.485' }));
    expect((await screen.findAllByText('مبلغ قابل پرداخت')).length).toBeGreaterThan(0);
  });

  it('rejects a zero weight before calling the pricing API', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.change(screen.getByLabelText('وزن طلا (گرم)'), { target: { value: '۰' } });
    expect(await screen.findByText('وزن باید عددی بزرگ‌تر از صفر باشد.')).toBeInTheDocument();
    expect(mockCalculate).not.toHaveBeenCalled();
  });

  it('shows a safe message when order creation fails', async () => {
    mockCreate.mockRejectedValue(new Error('socket hang up'));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    fireEvent.click(await openConfirm());
    expect(await screen.findByText('ثبت سفارش انجام نشد. لطفاً دوباره تلاش کنید.')).toBeInTheDocument();
    expect(screen.queryByText('socket hang up')).not.toBeInTheDocument();
  });

  it('maps insufficient credit from the server without the raw message', async () => {
    mockCreate.mockRejectedValue(
      new ApiClientError('ORDER_INSUFFICIENT_CREDIT', 'Insufficient available credit', 422),
    );
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    fireEvent.click(await openConfirm());
    expect(await screen.findByRole('alert')).toHaveTextContent('اعتبار کافی برای ثبت این سفارش ندارید.');
  });

  it('shows the trading-hours message when the market is closed', async () => {
    mockCreate.mockRejectedValue(
      new ApiClientError('TRADING_CLOSED', 'زمان معاملات در حال حاضر فعال نیست.', 422),
    );
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    fireEvent.click(await openConfirm());
    expect(await screen.findByRole('alert')).toHaveTextContent('زمان معاملات در حال حاضر فعال نیست.');
  });

  it('lets the seller pick their gold holding and caps typed weight to it', async () => {
    renderPage('sell');
    expect(await screen.findByRole('tab', { name: 'فروش طلا' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText(/موجودی طلا:/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '۲ گرم' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '۵ گرم' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('وزن طلا (گرم)'), { target: { value: '۵' } });
    expect(screen.getByDisplayValue('۲')).toBeInTheDocument();
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '2' }));
  });

  it('fills sell weight from a quick weight chip within the holding', async () => {
    renderPage('sell');
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.click(await screen.findByRole('button', { name: '۱ گرم' }));
    expect(screen.getByDisplayValue('۱')).toBeInTheDocument();
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1' }));
  });

  it('fills sell weight from a quick toman amount capped to the holding', async () => {
    renderPage('sell');
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    expect(screen.getByText('مبلغ سریع (تومان)')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '۲ میلیون' }));
    expect(await screen.findByDisplayValue('۱.۶۱۹')).toBeInTheDocument();
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1' }));
    expect(mockCalculate).toHaveBeenCalledWith(expect.objectContaining({ weightGrams: '1.619' }));
  });

  it('fills sell weight from a typed toman amount and follows the asset slider', async () => {
    renderPage('sell');
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    const slider = await screen.findByLabelText('میزان فروش از دارایی');
    expect(slider).toHaveAttribute('max', '2470000');
    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '1000000' } });
    expect(await screen.findByDisplayValue('۰.۸۰۹')).toBeInTheDocument();
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('وزن طلا (گرم)'), { target: { value: '۱' } });
    expect(await screen.findByDisplayValue('۱,۲۳۵,۰۰۰')).toBeInTheDocument();
    expect(await screen.findByLabelText('میزان فروش از دارایی')).toHaveValue('1235000');
  });

  it('creates a sell order from the selected gold holding', async () => {
    renderPage('sell');
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.click(await screen.findByRole('button', { name: 'فروش همه طلای موجود' }));
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    fireEvent.click(await openConfirm('sell'));
    expect(await screen.findByText('سفارش فروش ثبت شد')).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ side: 'SELL', weightGrams: '2' }));
  });

  it('maps insufficient gold from the server when a sell is rejected', async () => {
    mockSubmit.mockRejectedValue(
      new ApiClientError('ORDER_INSUFFICIENT_GOLD', 'Insufficient gold weight', 422),
    );
    renderPage('sell');
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.click(await screen.findByRole('button', { name: 'فروش همه طلای موجود' }));
    expect((await screen.findAllByText('مبلغ قابل دریافت')).length).toBeGreaterThan(0);
    fireEvent.click(await openConfirm('sell'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'موجودی طلای کافی برای ثبت این سفارش فروش ندارید.',
    );
  });
});
