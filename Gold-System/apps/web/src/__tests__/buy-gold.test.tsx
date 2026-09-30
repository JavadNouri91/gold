import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { BuyGoldPage } from '../components/portal/buy-gold/buy-gold-page';
import { ApiClientError, type CurrentPrice, type CustomerAccount, type CustomerProfile, type Order, type PricingCalculationResult } from '../lib/api';

const mockPush = jest.fn();
const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockGetPrice = jest.fn();
const mockCalculate = jest.fn();
const mockCreate = jest.fn();
const mockSubmit = jest.fn();

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
  createdAt: '2026-09-29T12:00:00.000Z',
};

function renderPage() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <BuyGoldPage />
    </SWRConfig>,
  );
}

async function calculateFiveGrams() {
  await screen.findByText(/۱۲,۳۵۰,۰۰۰/);
  fireEvent.click(screen.getByRole('button', { name: '۵ گرم' }));
  await screen.findByText('مبلغ قابل پرداخت');
}

async function openConfirm() {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'تأیید و ثبت سفارش' }));
  await screen.findByRole('dialog');
  const confirmButtons = screen.getAllByRole('button', { name: 'تأیید و ثبت سفارش' });
  return confirmButtons[confirmButtons.length - 1]!;
}

beforeEach(() => {
  mockPush.mockReset();
  mockGetMe.mockReset();
  mockGetAccount.mockReset();
  mockGetPrice.mockReset();
  mockCalculate.mockReset();
  mockCreate.mockReset();
  mockSubmit.mockReset();
  mockGetMe.mockResolvedValue(customer);
  mockGetAccount.mockResolvedValue(account());
  mockGetPrice.mockResolvedValue(price());
  mockCalculate.mockResolvedValue(calculation());
  mockCreate.mockResolvedValue({ ...submitted, status: 'DRAFT' });
  mockSubmit.mockResolvedValue(submitted);
});

describe('BuyGoldPage', () => {
  it('calculates from the pricing API and creates an order without sending a client total', async () => {
    renderPage();
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
    expect(screen.queryByText('مالیات')).not.toBeInTheDocument();
    expect(screen.queryByText('اجرت')).not.toBeInTheDocument();

    const confirm = await openConfirm();
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await screen.findByRole('status');
    expect(screen.getByText('سفارش خرید ثبت شد')).toBeInTheDocument();
    expect(screen.getByText('ORD-000125')).toBeInTheDocument();
    expect(screen.getByText('قیمت‌گذاری شده')).toBeInTheDocument();
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

  it('blocks submission when identity is not active', async () => {
    mockGetMe.mockResolvedValue({ ...customer, status: 'PENDING' });
    renderPage();
    expect(await screen.findByText('احراز هویت تکمیل نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تکمیل احراز هویت' })).toHaveAttribute('href', '/portal/kyc');
    expect(screen.getByRole('button', { name: 'تأیید و ثبت سفارش' })).toBeDisabled();
  });

  it('shows a shortfall when credit cannot cover the calculated total', async () => {
    mockGetAccount.mockResolvedValue(account('1000.00'));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    expect(screen.getByText('اعتبار کافی نیست')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'تأیید و ثبت سفارش' })).toBeDisabled();
  });

  it('keeps the reviewed price when the live snapshot changes', async () => {
    mockGetPrice.mockResolvedValueOnce(price('snap-1')).mockResolvedValue(price('snap-2'));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    fireEvent.click(screen.getByRole('button', { name: 'بروزرسانی قیمت' }));
    expect(await screen.findByText('قیمت طلا تغییر کرده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و ثبت سفارش' })).toBeDisabled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('disables confirmation when the snapshot TTL has passed', async () => {
    mockGetPrice.mockResolvedValue(price('snap-1', new Date(Date.now() - 1000).toISOString()));
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    await calculateFiveGrams();
    expect(screen.getByText('قیمت این سفارش منقضی شده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید و ثبت سفارش' })).toBeDisabled();
  });

  it('rejects a zero weight before calling the pricing API', async () => {
    renderPage();
    await screen.findByText('قیمت لحظه‌ای طلای آبشده');
    fireEvent.change(screen.getByLabelText('وزن طلا'), { target: { value: '۰' } });
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه قیمت' }));
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
});
