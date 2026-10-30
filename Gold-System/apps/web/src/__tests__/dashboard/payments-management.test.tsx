import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { PaymentsManagementPage } from '@/components/dashboard/payments-management-page';
import { signIn } from './auth-state';
import { toPersianDigits } from '@/lib/utils';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: {
    list: jest.fn(),
    getById: jest.fn(),
  },
  internalPaymentsApi: {
    list: jest.fn(),
    staffSummary: jest.fn(),
    submitInPersonReceipt: jest.fn(),
    record: jest.fn(),
    validate: jest.fn(),
    fail: jest.fn(),
  },
}));

jest.mock('@/lib/api', () => ({
  ApiClientError: class ApiClientError extends Error {},
  fetchBlob: jest.fn(),
}));

const { internalCustomersApi, internalPaymentsApi } = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: { list: jest.Mock; getById: jest.Mock };
  internalPaymentsApi: {
    list: jest.Mock;
    staffSummary: jest.Mock;
    submitInPersonReceipt: jest.Mock;
    record: jest.Mock;
    validate: jest.Mock;
    fail: jest.Mock;
  };
};

const customer = {
  id: 'c1',
  customerNumber: 'C-100',
  userId: null,
  firstName: 'علی',
  lastName: 'رضایی',
  fullName: 'علی رضایی',
  nationalId: '001',
  mobile: '09121111111',
  email: null,
  dateOfBirth: null,
  address: null,
  type: 'HOUSEHOLD',
};

const pendingPayment = {
  id: 'pay-pending',
  tradeId: null,
  customerId: 'c1',
  customerName: 'علی رضایی',
  customerMobile: '09121111111',
  tradeNumber: null,
  orderNumber: null,
  direction: 'DEPOSIT',
  method: 'BANK_TRANSFER',
  amount: '1500000.00',
  currency: 'IRR',
  status: 'PENDING',
  referenceNumber: 'TRK99',
  notes: null,
  receivedAt: null,
  validatedAt: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const validatedPayment = {
  ...pendingPayment,
  id: 'pay-ok',
  status: 'VALIDATED',
  referenceNumber: 'R-8',
};

const pendingWithdrawal = {
  id: 'pay-wd',
  tradeId: null,
  customerId: 'c1',
  customerName: 'علی رضایی',
  customerMobile: '09121111111',
  tradeNumber: null,
  orderNumber: null,
  direction: 'WITHDRAWAL',
  method: 'BANK_TRANSFER',
  amount: '8000000.00',
  currency: 'IRR',
  status: 'PENDING',
  referenceNumber: null,
  customerBankAccountId: 'ba-1',
  destinationIban: 'IR000560000000000000000001',
  destinationBankName: 'بانک سامان',
  destinationAccountHolder: 'علی رضایی',
  notes: 'درخواست برداشت وجه به شبا …',
  receivedAt: null,
  validatedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

describe('PaymentsManagementPage', () => {
  beforeEach(() => {
    internalPaymentsApi.list.mockReset();
    internalPaymentsApi.staffSummary.mockReset();
    internalPaymentsApi.submitInPersonReceipt.mockReset();
    internalPaymentsApi.record.mockReset();
    internalPaymentsApi.validate.mockReset();
    internalPaymentsApi.fail.mockReset();
    internalCustomersApi.list.mockReset();
    internalCustomersApi.getById.mockReset();
    internalCustomersApi.getById.mockResolvedValue({ ...customer, verificationStatus: 'VERIFIED' });
    window.print = jest.fn();

    internalPaymentsApi.list.mockResolvedValue({
      data: [pendingPayment, validatedPayment],
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });
    internalPaymentsApi.staffSummary.mockResolvedValue({
      deposits: {
        pendingCount: 5,
        pendingAmountRial: '1500000.00',
        todayValidatedAmountRial: '1000000.00',
        totalSuccessfulAmountRial: '5000000.00',
        totalCount: 9,
      },
      withdrawals: {
        pendingCount: 2,
        pendingAmountRial: '8000000.00',
        todayValidatedAmountRial: '3000000.00',
        totalSuccessfulAmountRial: '12000000.00',
        totalCount: 3,
      },
    });
  });

  it('renders the dashboard title, KPIs and table rows', async () => {
    signIn(['payment.read', 'payment.create', 'payment.validate']);
    render(<PaymentsManagementPage />);

    expect(await screen.findByText('مدیریت واریز و برداشت')).toBeInTheDocument();
    expect(await screen.findByText(/۵ مورد/)).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('TRK99'))).toBeInTheDocument();
    expect(screen.getAllByText('علی رضایی').length).toBeGreaterThan(0);
  });

  it('lists deposits by default and passes direction to the API', async () => {
    signIn(['payment.read', 'payment.create', 'payment.validate']);
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PaymentsManagementPage />
      </SWRConfig>,
    );

    await screen.findByText('مدیریت واریز و برداشت');
    await waitFor(() =>
      expect(internalPaymentsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ direction: 'DEPOSIT' }),
      ),
    );
  });

  it('switches to the withdrawals tab and loads withdrawal rows', async () => {
    signIn(['payment.read', 'payment.validate']);
    internalPaymentsApi.list.mockImplementation(async (params) => {
      if (params?.direction === 'WITHDRAWAL') {
        return { data: [pendingWithdrawal], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
      }
      return { data: [pendingPayment, validatedPayment], meta: { total: 2, page: 1, limit: 20, totalPages: 1 } };
    });

    render(<PaymentsManagementPage />);
    await screen.findByText('مدیریت واریز و برداشت');

    fireEvent.click(screen.getByRole('button', { name: /برداشت‌ها/ }));

    expect(await screen.findByText(toPersianDigits('IR000560000000000000000001'))).toBeInTheDocument();
    expect(await screen.findByLabelText('تأیید برداشت')).toBeInTheDocument();
    expect(screen.getByLabelText('رد برداشت')).toBeInTheDocument();
  });

  it('opens the withdrawal detail modal showing the destination account', async () => {
    signIn(['payment.read', 'payment.validate']);
    internalPaymentsApi.list.mockImplementation(async (params) => {
      if (params?.direction === 'WITHDRAWAL') {
        return { data: [pendingWithdrawal], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
      }
      return { data: [pendingPayment, validatedPayment], meta: { total: 2, page: 1, limit: 20, totalPages: 1 } };
    });

    render(<PaymentsManagementPage />);
    await screen.findByText('مدیریت واریز و برداشت');
    fireEvent.click(screen.getByRole('button', { name: /برداشت‌ها/ }));

    fireEvent.click((await screen.findAllByRole('button', { name: /^مشاهده پرداخت/ }))[0]!);

    expect(await screen.findByRole('dialog', { name: 'جزئیات برداشت وجه' })).toBeInTheDocument();
    expect(screen.getAllByText('بانک سامان').length).toBeGreaterThan(0);
    expect(screen.getByText(/مبلغ این برداشت تا زمان تأیید مالی رزرو شده است/)).toBeInTheDocument();
    expect(screen.getByText('تأیید و واریز به شبا', { exact: false })).toBeInTheDocument();
  });

  it('shows approve and reject only for pending rows', async () => {
    signIn(['payment.read', 'payment.validate']);
    render(<PaymentsManagementPage />);

    expect(await screen.findByLabelText('تأیید پرداخت')).toBeInTheDocument();
    expect(screen.getByLabelText('رد پرداخت')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^مشاهده پرداخت/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^چاپ پرداخت/ })).toHaveLength(2);
  });

  it('applies statusGroup filter from the URL on mount', async () => {
    window.history.replaceState({}, '', '/dashboard/payments?statusGroup=submitted');
    signIn(['payment.read', 'payment.create', 'payment.validate']);
    render(<PaymentsManagementPage />);

    await waitFor(() =>
      expect(internalPaymentsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ statusGroup: 'submitted' }),
      ),
    );
  });

  it('opens the details modal from the view button without printing', async () => {
    signIn(['payment.read', 'payment.validate']);
    render(<PaymentsManagementPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: /^مشاهده پرداخت/ }))[0]!);

    expect(await screen.findByRole('dialog', { name: 'جزئیات پرداخت و بررسی فیش' })).toBeInTheDocument();
    expect(screen.getByText('تایید و اعمال پرداخت', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('رد درخواست', { exact: false })).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('opens the details modal and prints when the print button is clicked', async () => {
    signIn(['payment.read', 'payment.validate']);
    render(<PaymentsManagementPage />);

    fireEvent.click((await screen.findAllByRole('button', { name: /^چاپ پرداخت/ }))[0]!);

    expect(await screen.findByRole('dialog', { name: 'جزئیات پرداخت و بررسی فیش' })).toBeInTheDocument();
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'مشاهده پرداخت #PAYPEN' })).toHaveTextContent('نمایش');
    expect(screen.getByRole('button', { name: 'چاپ پرداخت #PAYPEN' })).toHaveTextContent('چاپ');
  });

  it('opens the drawer and records a wallet receipt with customer search', async () => {
    signIn(['payment.read', 'payment.create', 'payment.validate']);
    internalCustomersApi.list.mockResolvedValue({
      items: [customer],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    internalPaymentsApi.submitInPersonReceipt.mockResolvedValue({ id: 'pay-new', status: 'PENDING' });
    internalPaymentsApi.validate.mockResolvedValue({ id: 'pay-new', status: 'VALIDATED' });

    render(<PaymentsManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت واریز جدید/ }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('واریز به کیف پول (اعتبار)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'مشتری' }));
    const search = await screen.findByPlaceholderText('نام یا موبایل را بنویسید...');
    fireEvent.change(search, { target: { value: 'علی' } });

    await waitFor(() => expect(internalCustomersApi.list).toHaveBeenCalled());

    const option = await screen.findByRole('option', { name: /علی رضایی/ });
    fireEvent.click(option);

    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '150000' } });
    fireEvent.change(screen.getByLabelText(/شماره پیگیری/), { target: { value: 'TRK99' } });
    fireEvent.change(screen.getByLabelText('فایل فیش'), {
      target: { files: [new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], 'slip.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و تایید تراکنش' }));

    await waitFor(() => {
      expect(internalPaymentsApi.submitInPersonReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'c1',
          method: 'BANK_TRANSFER',
          amount: '1500000',
          referenceNumber: 'TRK99',
        }),
      );
    });
    expect(internalPaymentsApi.validate).toHaveBeenCalledWith('pay-new');
  });

  it('records a trade settlement from the trade tab', async () => {
    signIn(['payment.read', 'payment.create']);
    internalPaymentsApi.record.mockResolvedValue({
      payment: { id: 'pay-trade', status: 'PENDING' },
      wasAlreadyRecorded: false,
    });

    render(<PaymentsManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت واریز جدید/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تسویه معامله / سفارش' }));

    fireEvent.change(screen.getByLabelText('شناسه معامله'), { target: { value: 'tr-1' } });
    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '200000' } });
    fireEvent.change(screen.getByLabelText(/شماره پیگیری/), { target: { value: 'REF1' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و تایید تراکنش' }));

    await waitFor(() => {
      expect(internalPaymentsApi.record).toHaveBeenCalledWith(
        expect.objectContaining({
          tradeId: 'tr-1',
          amount: '2000000',
          referenceNumber: 'REF1',
        }),
      );
    });
    expect(internalPaymentsApi.validate).not.toHaveBeenCalled();
  });

  it('asks for a customer before submitting wallet deposit', async () => {
    signIn(['payment.read', 'payment.create']);
    render(<PaymentsManagementPage />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت واریز جدید/ }));
    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و تایید تراکنش' }));

    expect(await screen.findByText('مشتری را انتخاب کنید.')).toBeInTheDocument();
    expect(internalPaymentsApi.submitInPersonReceipt).not.toHaveBeenCalled();
  });
});
