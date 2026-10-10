import React from 'react';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { ApiClientError, type CustomerAccount, type CustomerProfile } from '@/lib/api';
import { RialBalanceCard } from '@/components/portal/rial-balance-card';
import { DashboardHeader } from '@/components/portal/dashboard-header';

const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockSummary = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/portal/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    customerApi: {
      ...actual.customerApi,
      getMe: (...args: unknown[]) => mockGetMe(...args),
      getMyAccount: (...args: unknown[]) => mockGetAccount(...args),
    },
    notificationsApi: {
      ...actual.notificationsApi,
      summary: (...args: unknown[]) => mockSummary(...args),
    },
  };
});

function account(overrides: Partial<CustomerAccount> = {}): CustomerAccount {
  return {
    id: 'acc-1',
    customerId: 'c-1',
    status: 'ACTIVE',
    creditLimitRial: '5000000000.00',
    reservedCreditRial: '1500000000.00',
    consumedCreditRial: '1750000000.00',
    availableCreditRial: '1.00',
    availableRial: '1750000000.00',
    creditLimitGoldRial: '888888888.00',
    reservedCreditGoldRial: '10.00',
    consumedCreditGoldRial: '20.00',
    ...overrides,
  };
}

const customer: CustomerProfile = {
  id: 'c-1',
  customerNumber: 'C-1',
  firstName: 'علی',
  lastName: 'رضایی',
  mobile: '09120000000',
  status: 'ACTIVE',
  accountStatus: 'ACTIVE',
  type: 'HOUSEHOLD',
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderCard() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <RialBalanceCard />
    </SWRConfig>,
  );
}

beforeEach(() => {
  mockGetMe.mockReset();
  mockGetAccount.mockReset();
  mockSummary.mockReset();
  mockGetMe.mockResolvedValue(customer);
  mockGetAccount.mockResolvedValue(account());
  mockSummary.mockResolvedValue({ unread: 0 });
});

describe('RialBalanceCard', () => {
  it('shows the server available Rial balance in Persian digits and links to the account page', async () => {
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveAttribute('href', '/portal/credit');
    expect(link).toHaveTextContent('۱,۷۵۰,۰۰۰,۰۰۰ ریال');
    expect(link).not.toHaveTextContent('۱,۵۰۰,۰۰۰,۰۰۰');
    expect(link).not.toHaveTextContent('۵,۰۰۰,۰۰۰,۰۰۰');
    expect(link).not.toHaveTextContent('۸۸۸,۸۸۸,۸۸۸');
    expect(link).not.toHaveTextContent('۱ ریال');
    expect(mockGetAccount).toHaveBeenCalledTimes(1);
  });

  it('keeps a loading placeholder until the account response arrives', () => {
    mockGetAccount.mockReturnValue(new Promise(() => undefined));
    renderCard();

    const link = screen.getByRole('link', { name: /توان خرید/ });
    expect(link).toHaveAttribute('aria-busy', 'true');
    expect(link).not.toHaveTextContent('۰');
  });

  it('shows an error state without inventing a balance', async () => {
    mockGetAccount.mockRejectedValue(new ApiClientError('SERVER', 'fail', 500));
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('خطا در دریافت');
    expect(link).not.toHaveTextContent('۰ ریال');
    expect(link).toHaveAttribute('href', '/portal/credit');
  });

  it('shows an unavailable balance when the account does not exist', async () => {
    mockGetAccount.mockRejectedValue(new ApiClientError('NOT_FOUND', 'missing', 404));
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('—');
    expect(link).not.toHaveTextContent('۰');
  });

  it('shows an unavailable balance when the server omits the available amount', async () => {
    mockGetAccount.mockResolvedValue(
      account({ availableRial: undefined, availableCreditRial: '' }),
    );
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('—');
    expect(link).not.toHaveTextContent('۵,۰۰۰,۰۰۰,۰۰۰');
  });
});

describe('DashboardHeader', () => {
  it('keeps the Rial balance in the header beside the signed-in customer', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <DashboardHeader onMenu={() => undefined} />
      </SWRConfig>,
    );

    expect(await screen.findByText('سلام علی رضایی 👋')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('۱,۷۵۰,۰۰۰,۰۰۰ ریال');
    expect(link).toHaveAttribute('href', '/portal/credit');
  });
});
