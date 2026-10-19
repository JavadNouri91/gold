import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { DashboardHeader } from '@/components/portal/dashboard-header';
import { DashboardSidebar } from '@/components/portal/dashboard-sidebar';
import { ThemeProvider } from '@/components/theme-provider';
import type { CustomerAccount, CustomerProfile } from '@/lib/api';
import { CUSTOMER_SELF_PERMISSIONS } from '@/lib/permissions';

const mockGetMe = jest.fn();
const mockGetAccount = jest.fn();
const mockSummary = jest.fn();
const mockLogout = jest.fn();
const mockPortfolio = jest.fn();
let mockPathname = '/portal/dashboard';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'u-1',
      mobile: '09120000000',
      roles: ['CUSTOMER'],
      permissions: [...CUSTOMER_SELF_PERMISSIONS],
    },
    isLoading: false,
    isAuthenticated: true,
    logout: (...args: unknown[]) => mockLogout(...args),
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
    fetchBlob: jest.fn().mockRejectedValue(new Error('no avatar')),
  };
});

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

function account(): CustomerAccount {
  return {
    id: 'acc-1',
    customerId: 'c-1',
    status: 'ACTIVE',
    creditLimitRial: '5000000000.00',
    reservedCreditRial: '0',
    consumedCreditRial: '0',
    availableCreditRial: '1.00',
    availableRial: '158260000.00',
    creditLimitGoldRial: '0',
    reservedCreditGoldRial: '0',
    consumedCreditGoldRial: '0',
  };
}

function wrap(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mockPathname = '/portal/dashboard';
  mockGetMe.mockReset();
  mockGetAccount.mockReset();
  mockSummary.mockReset();
  mockLogout.mockReset();
  mockPortfolio.mockReset();
  mockGetMe.mockResolvedValue(customer);
  mockGetAccount.mockResolvedValue(account());
  mockSummary.mockResolvedValue({ unread: 7 });
  mockLogout.mockResolvedValue(undefined);
  mockPortfolio.mockResolvedValue({
    weightGrams: '0',
    reservedPickupGrams: '0',
    purityRatio: null,
    averageBuyPriceRial: null,
    totalBuyValueRial: null,
    totalSellValueRial: null,
  });
  document.body.style.overflow = '';
});

describe('DashboardHeader mobile chrome', () => {
  it('shows the menu trigger, notifications, purchasing power, and live greeting', async () => {
    const onMenu = jest.fn();
    wrap(<DashboardHeader onMenu={onMenu} />);

    expect((await screen.findAllByText('سلام علی رضایی 👋')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('مشتری خانگی').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('فعال').length).toBeGreaterThanOrEqual(1);

    const pickup = await screen.findAllByRole('link', { name: /طلای در انتظار تحویل/ });
    expect(pickup[0]).toHaveAttribute('href', '/portal/pickups/new');
    expect(pickup[0]).not.toHaveAttribute('title');
    await userEvent.hover(pickup[0]!);
    expect(await screen.findByRole('tooltip', { name: /طلای در انتظار تحویل/ })).toHaveClass('font-sans');
    await userEvent.unhover(pickup[0]!);

    const balance = screen.getAllByRole('link', { name: /توان خرید/ })[0]!;
    expect(balance).toHaveAttribute('href', '/portal/credit');
    expect(balance).not.toHaveAttribute('title');
    await userEvent.hover(balance);
    expect(await screen.findByRole('tooltip', { name: /توان خرید/ })).toHaveClass('font-sans');

    expect(screen.getAllByRole('link', { name: /اعلان‌ها، ۷ خوانده‌نشده/ })[0]).toHaveAttribute(
      'href',
      '/portal/notifications',
    );

    await userEvent.click(screen.getByRole('button', { name: 'منو' }));
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

describe('DashboardSidebar mobile drawer', () => {
  it('opens with user details, balance, and emerald active dashboard link', async () => {
    const onClose = jest.fn();
    wrap(<DashboardSidebar open onClose={onClose} />);

    expect(await screen.findByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'بستن منو' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'علی رضایی' })).toBeInTheDocument();
    expect(screen.getByText('مشتری خانگی')).toBeInTheDocument();
    expect(screen.getByText(/حساب فعال/)).toBeInTheDocument();

    const nameRow = screen.getByRole('heading', { name: 'علی رضایی' }).parentElement?.parentElement;
    expect(within(nameRow!).getByRole('link', { name: 'احراز هویت تأیید شده' })).toBeInTheDocument();

    const drawerPickup = await screen.findByRole('link', { name: /طلای در انتظار تحویل/ });
    expect(drawerPickup).toHaveAttribute('href', '/portal/pickups/new');
    expect(drawerPickup).not.toHaveTextContent('مشاهده درخواست‌ها');
    expect(drawerPickup).not.toHaveTextContent('درخواست تحویل حضوری');

    const drawerBalance = screen.getByRole('link', { name: /توان خرید شما/ });
    expect(drawerBalance).toHaveAttribute('href', '/portal/credit');
    expect(drawerBalance).toHaveTextContent('۱۵,۸۲۶,۰۰۰ تومان');
    expect(drawerBalance).not.toHaveTextContent('مشاهده جزئیات دارایی و موجودی');

    const nav = screen.getByRole('navigation', { name: 'منوی کشویی پورتال' });
    const dashboard = within(nav).getByRole('link', { name: 'داشبورد' });
    expect(dashboard).toHaveAttribute('href', '/portal/dashboard');
    expect(dashboard).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'اعتبار' })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'خرید و فروش طلا' })).toHaveAttribute(
      'href',
      '/portal/orders/new',
    );
    expect(within(nav).getByRole('link', { name: 'واریز و برداشت' })).toHaveAttribute(
      'href',
      '/portal/payments',
    );
    expect(within(nav).getByRole('link', { name: 'تنظیمات' })).toHaveAttribute(
      'href',
      '/portal/profile#settings',
    );
  });

  it('closes from backdrop, Escape, and navigation; locks body scroll while open', async () => {
    const onClose = jest.fn();
    const { rerender } = wrap(<DashboardSidebar open onClose={onClose} />);

    await screen.findByRole('dialog');
    expect(document.body.style.overflow).toBe('hidden');

    await userEvent.click(screen.getByRole('button', { name: 'بستن منو' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);

    const nav = screen.getByRole('navigation', { name: 'منوی کشویی پورتال' });
    const assetsLink = within(nav).getByRole('link', { name: 'دارایی‌های من' });
    assetsLink.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(assetsLink);
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(
      <ThemeProvider>
        <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
          <DashboardSidebar open={false} onClose={onClose} />
        </SWRConfig>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(document.body.style.overflow).toBe('');
    });
    expect(screen.queryByRole('button', { name: 'بستن منو' })).not.toBeInTheDocument();
  });

  it('logs out through the drawer action', async () => {
    const onClose = jest.fn();
    wrap(<DashboardSidebar open onClose={onClose} />);

    const drawer = await screen.findByRole('dialog', { name: 'علی رضایی' });
    const logoutButtons = within(drawer).getAllByRole('button', { name: 'خروج از حساب' });
    await userEvent.click(logoutButtons[logoutButtons.length - 1]!);
    expect(onClose).toHaveBeenCalled();
    expect(mockLogout).toHaveBeenCalled();
  });

  it('opens support from the drawer without inventing a support route', async () => {
    wrap(<DashboardSidebar open onClose={() => undefined} />);

    const drawer = await screen.findByRole('dialog', { name: 'علی رضایی' });
    await userEvent.click(within(drawer).getByRole('button', { name: 'پشتیبانی و راهنما' }));
    expect(await screen.findByRole('dialog', { name: 'پشتیبانی' })).toBeInTheDocument();
  });
});
