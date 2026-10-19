import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    internalPaymentsApi.list.mockResolvedValue({
      data: [pendingPayment, validatedPayment],
      meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
    });
    internalPaymentsApi.staffSummary.mockResolvedValue({
      pendingCount: 5,
      todayValidatedAmountRial: '1000000.00',
      totalSuccessfulAmountRial: '5000000.00',
    });
  });

  it('renders the dashboard title, KPIs and table rows', async () => {
    signIn(['payment.read', 'payment.create', 'payment.validate']);
    render(<PaymentsManagementPage />);

    expect(await screen.findByText('مدیریت پرداخت‌ها و فیش‌ها')).toBeInTheDocument();
    expect(await screen.findByText(/۵ مورد/)).toBeInTheDocument();
    expect(screen.getByText(toPersianDigits('TRK99'))).toBeInTheDocument();
    expect(screen.getAllByText('علی رضایی').length).toBeGreaterThan(0);
  });

  it('shows approve and reject only for pending rows', async () => {
    signIn(['payment.read', 'payment.validate']);
    render(<PaymentsManagementPage />);

    expect(await screen.findByLabelText('تأیید پرداخت')).toBeInTheDocument();
    expect(screen.getByLabelText('رد پرداخت')).toBeInTheDocument();
    expect(screen.getAllByLabelText('مشاهده جزئیات')).toHaveLength(2);
  });

  it('opens a details modal from the eye icon instead of navigating', async () => {
    signIn(['payment.read', 'payment.validate']);
    render(<PaymentsManagementPage />);

    fireEvent.click((await screen.findAllByLabelText('مشاهده جزئیات'))[0]!);

    expect(await screen.findByRole('dialog', { name: 'جزئیات پرداخت و بررسی فیش' })).toBeInTheDocument();
    expect(screen.getByText('تایید و اعمال پرداخت', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('رد درخواست', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'مشاهده جزئیات' })).not.toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: /ثبت پرداخت جدید/ }));

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
    fireEvent.click(await screen.findByRole('button', { name: /ثبت پرداخت جدید/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: /ثبت پرداخت جدید/ }));
    fireEvent.change(screen.getByLabelText('مبلغ (تومان)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت و تایید تراکنش' }));

    expect(await screen.findByText('مشتری را انتخاب کنید.')).toBeInTheDocument();
    expect(internalPaymentsApi.submitInPersonReceipt).not.toHaveBeenCalled();
  });
});
