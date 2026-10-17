import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { ApiClientError, type CustomerAccount, type CustomerProfile } from '@/lib/api';
import { RialBalanceCard } from '@/components/portal/rial-balance-card';
import { DashboardHeader } from '@/components/portal/dashboard-header';
import { ThemeProvider } from '@/components/theme-provider';

const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockSummary = jest.fn();
const mockPortfolio = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => '/portal/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-1', mobile: '09120000000', roles: [], permissions: [] },
    isLoading: false,
    isAuthenticated: true,
    logout: jest.fn(),
  }),
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
    ordersApi: {
      ...actual.ordersApi,
      portfolio: (...args: unknown[]) => mockPortfolio(...args),
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
  mockPortfolio.mockReset();
  mockGetMe.mockResolvedValue(customer);
  mockGetAccount.mockResolvedValue(account());
  mockSummary.mockResolvedValue({ unread: 0 });
  mockPortfolio.mockResolvedValue({
    weightGrams: '20.000000',
    reservedPickupGrams: '5.000000',
    purityRatio: '0.750000',
    averageBuyPriceRial: null,
    totalBuyValueRial: null,
    totalSellValueRial: null,
  });
});

describe('RialBalanceCard', () => {
  it('shows the server available Rial balance in Persian digits and links to the account page', async () => {
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveAttribute('href', '/portal/credit');
    expect(link).toHaveTextContent('۱۷۵,۰۰۰,۰۰۰ تومان');
    expect(link.textContent).not.toMatch(/\d*[.٫]\d/);
    expect(link).not.toHaveTextContent('۱,۵۰۰,۰۰۰,۰۰۰');
    expect(link).not.toHaveTextContent('۵,۰۰۰,۰۰۰,۰۰۰');
    expect(link).not.toHaveTextContent('۸۸۸,۸۸۸,۸۸۸');
    expect(link).not.toHaveTextContent('۱ تومان');
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
    expect(link).not.toHaveTextContent('۰ تومان');
    expect(link).toHaveAttribute('href', '/portal/credit');
  });

  it('shows an unavailable balance when the account does not exist', async () => {
    mockGetAccount.mockRejectedValue(new ApiClientError('NOT_FOUND', 'missing', 404));
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('—');
    expect(link).not.toHaveTextContent('۰');
  });

  it('shows purchasing power as whole toman when the balance has a fraction', async () => {
    mockGetAccount.mockResolvedValue(account({ availableRial: '1750000005.70' }));
    renderCard();

    const link = await screen.findByRole('link', { name: /توان خرید/ });
    expect(link).toHaveTextContent('۱۷۵,۰۰۰,۰۰۰ تومان');
    expect(link.textContent).not.toMatch(/[٫.]/);
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
    const onMenu = jest.fn();
    render(
      <ThemeProvider>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <DashboardHeader onMenu={onMenu} />
        </SWRConfig>
      </ThemeProvider>,
    );

    expect((await screen.findAllByText('سلام علی رضایی 👋')).length).toBeGreaterThanOrEqual(1);
    const links = screen.getAllByRole('link', { name: /توان خرید/ });
    expect(links.length).toBeGreaterThanOrEqual(2);
    const iconLink = links.find((link) => /\bw-11\b/.test(link.className));
    const labeledLink = links.find((link) => link.className.includes('max-w'));
    expect(iconLink).toHaveAttribute('href', '/portal/credit');
    expect(iconLink).not.toHaveAttribute('title');
    expect(labeledLink).toHaveAttribute('href', '/portal/credit');
    expect(labeledLink).toHaveTextContent('۱۷۵,۰۰۰,۰۰۰ تومان');
    expect(screen.getByRole('button', { name: 'منو' })).toBeInTheDocument();
    const verified = await screen.findAllByRole('link', { name: 'احراز هویت تأیید شده' });
    expect(verified.length).toBeGreaterThanOrEqual(1);
    expect(verified[0]).not.toHaveAttribute('title');
    expect(screen.getAllByTestId('kyc-verified-icon').length).toBeGreaterThanOrEqual(1);
    const pickup = await screen.findAllByRole('link', { name: /طلای در انتظار تحویل/ });
    expect(pickup.length).toBeGreaterThanOrEqual(2);
    const pickupIcon = pickup.find((link) => /\bw-11\b/.test(link.className));
    const pickupLabeled = pickup.find((link) => link.className.includes('max-w'));
    expect(pickupIcon).toHaveAttribute('href', '/portal/pickups');
    expect(pickupIcon).not.toHaveAttribute('title');
    expect(pickupLabeled).toHaveAttribute('href', '/portal/pickups');
    expect(pickupLabeled).toHaveTextContent('۵ گرم');

    const user = userEvent.setup();
    await user.hover(verified[0]!);
    expect(await screen.findByRole('tooltip', { name: 'هویت شما تأیید شده و می‌توانید معامله کنید.' })).toHaveClass(
      'font-sans',
    );
    await user.unhover(verified[0]!);
    await user.hover(iconLink!);
    expect(await screen.findByRole('tooltip', { name: /توان خرید/ })).toHaveClass('font-sans');
    await user.unhover(iconLink!);
    await user.hover(pickupIcon!);
    expect(await screen.findByRole('tooltip', { name: /طلای در انتظار تحویل/ })).toHaveClass('font-sans');
  });

  it('shows a KYC warning beside purchasing power when the customer is not verified', async () => {
    mockGetMe.mockResolvedValue({ ...customer, status: 'PENDING' });
    render(
      <ThemeProvider>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <DashboardHeader onMenu={jest.fn()} />
        </SWRConfig>
      </ThemeProvider>,
    );

    const warning = await screen.findAllByRole('link', { name: 'هشدار احراز هویت نشده' });
    expect(warning.length).toBeGreaterThanOrEqual(1);
    expect(warning[0]).toHaveAttribute('href', '/portal/kyc');
    expect(warning[0]).not.toHaveAttribute('title');
    await userEvent.hover(warning[0]!);
    expect(
      await screen.findByRole('tooltip', { name: 'احراز هویت نشده است. برای معامله مدارک را ارسال کنید.' }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('kyc-warning-icon').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('kyc-verified-icon')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /توان خرید/ })[0]).toHaveAttribute('href', '/portal/credit');
  });
});
