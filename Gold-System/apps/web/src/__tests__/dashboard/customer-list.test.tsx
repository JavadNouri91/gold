import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CustomersPage from '@/app/dashboard/customers/page';
import { signIn } from './auth-state';
import { toPersianDigits } from '@/lib/utils';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/customers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: {
    list: jest.fn(),
    summary: jest.fn(),
    exportCsv: jest.fn(),
    sendBulkSms: jest.fn(),
    setAccountStatus: jest.fn(),
    assignType: jest.fn(),
  },
}));

const { internalCustomersApi } = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: {
    list: jest.Mock;
    summary: jest.Mock;
    exportCsv: jest.Mock;
    sendBulkSms: jest.Mock;
    setAccountStatus: jest.Mock;
    assignType: jest.Mock;
  };
};

const sampleCustomer = {
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
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  verificationStatus: 'VERIFIED',
  segment: 'REGULAR',
  rejectionReason: null,
  isTradeEligible: true,
  orderCount: 2,
  lastPurchaseAt: '2026-10-01T00:00:00.000Z',
  balanceRial: '0.00',
  totalPurchaseRial: '0.00',
  totalWeightGrams: '42.73',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('customer list', () => {
  beforeEach(() => {
    internalCustomersApi.list.mockResolvedValue({
      items: [sampleCustomer],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    internalCustomersApi.summary.mockResolvedValue({
      total: 16,
      active: 8,
      vip: 1,
      debtors: 2,
      debtorsBalanceRial: '8434120000.00',
      newCustomers: 3,
      pendingVerification: 3,
    });
  });

  it('renders customers returned by the API', async () => {
    signIn(['customer.read', 'customer.account.read']);
    render(<CustomersPage />);
    expect(await screen.findByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText(`#${toPersianDigits('C-100')}`)).toBeInTheDocument();
    await waitFor(() => {
      expect(internalCustomersApi.list).toHaveBeenCalled();
    });
  });

  it('shows KPI cards and KYC / gold columns', async () => {
    signIn(['customer.read', 'customer.account.read']);
    render(<CustomersPage />);
    expect(await screen.findByRole('link', { name: /کل مشتریان/ })).toHaveAttribute(
      'href',
      '/dashboard/customers',
    );
    expect(screen.getByText('در انتظار احراز هویت')).toBeInTheDocument();
    expect(await screen.findByText(toPersianDigits('42.73') + ' گرم')).toBeInTheDocument();
    expect(screen.getAllByText('تأیید شده').length).toBeGreaterThan(0);
  });

  it('shows the bulk action bar after selecting a row', async () => {
    signIn(['customer.read', 'customer.account.read', 'customer.group.assign']);
    const user = userEvent.setup();
    render(<CustomersPage />);
    expect(await screen.findByText('علی رضایی')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /انتخاب علی رضایی/ });
    await user.click(checkbox);
    const bar = await screen.findByText(/مشتری انتخاب شده/);
    expect(bar).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ارسال پیامک گروهی/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تغییر گروه مشتری/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^مسدودسازی$/ })).toBeInTheDocument();
  });

  it('blocks the list without customer.read', () => {
    signIn(['order.read']);
    render(<CustomersPage />);
    expect(screen.getByText(/customer.read/)).toBeInTheDocument();
  });
});
