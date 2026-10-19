import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { UserStatusBadge } from '../components/portal/user-status-badge';
import { KycStatusCard, resolveKycUiStatus } from '../components/portal/kyc-status-card';
import { QuickActions } from '../components/portal/quick-actions';
import { ActiveOrders } from '../components/portal/active-orders';
import { RecentTransactions } from '../components/portal/recent-transactions';
import { PortfolioCard } from '../components/portal/portfolio-card';
import { PendingPickupCard } from '../components/portal/pending-pickup-card';
import { GoldPriceChart } from '../components/portal/gold-price-chart';
import { demoPriceSeries, DEMO_ACTIVE_ORDERS, DEMO_RECENT_TRADES } from '../lib/portal-demo';
import { toPersianDigits } from '../lib/utils';

const mockPortfolio = jest.fn();

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    ordersApi: {
      ...actual.ordersApi,
      portfolio: (...args: unknown[]) => mockPortfolio(...args),
    },
  };
});

describe('resolveKycUiStatus', () => {
  it('maps approved and active customers to approved', () => {
    expect(resolveKycUiStatus({ customerStatus: 'ACTIVE' })).toBe('approved');
    expect(resolveKycUiStatus({ kycStatus: 'APPROVED' })).toBe('approved');
  });

  it('maps rejected KYC to revision', () => {
    expect(resolveKycUiStatus({ kycStatus: 'REJECTED' })).toBe('revision');
  });

  it('maps pending review to review', () => {
    expect(resolveKycUiStatus({ kycStatus: 'UNDER_REVIEW' })).toBe('review');
  });

  it('maps missing KYC to unverified', () => {
    expect(resolveKycUiStatus({})).toBe('unverified');
  });
});

describe('UserStatusBadge', () => {
  it('shows household customer type', () => {
    render(<UserStatusBadge type="HOUSEHOLD" status="ACTIVE" />);
    expect(screen.getByText('مشتری خانگی')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();
  });

  it('shows partner and VIP labels', () => {
    const { rerender } = render(<UserStatusBadge type="PARTNER" status="ACTIVE" />);
    expect(screen.getByText('همکار')).toBeInTheDocument();
    rerender(<UserStatusBadge type="VIP" status="ACTIVE" />);
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });
});

describe('KycStatusCard', () => {
  it('renders verified copy', () => {
    render(<KycStatusCard customerStatus="ACTIVE" kycStatus="APPROVED" />);
    expect(screen.getByText('احراز هویت شما تأیید شده است.')).toBeInTheDocument();
  });
});


describe('QuickActions', () => {
  it('links to existing portal routes', () => {
    render(<QuickActions />);
    expect(screen.getByText('واریز و برداشت').closest('a')).toHaveAttribute('href', '/portal/payments');
    expect(screen.getByText('سفارش جدید').closest('a')).toHaveAttribute(
      'href',
      '/portal/orders/new',
    );
  });
});

describe('PortfolioCard', () => {
  it('shows the empty holding state until a booked position exists', () => {
    render(<PortfolioCard />);
    expect(screen.getByText('هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByText('خرید طلا')).toBeInTheDocument();
    expect(screen.getByText('فروش طلا')).toBeInTheDocument();
  });

  it('shows average buy price as whole toman', () => {
    render(
      <PortfolioCard
        position={{
          weightGrams: '10.000000',
          reservedPickupGrams: '0',
          purityLabel: '750',
          averageBuyPriceRial: '56125005.70',
          marketValueRial: '584200000',
          changeRial: null,
          changePercent: null,
          realizedPnlRial: null,
          unrealizedPnlRial: null,
          totalBuyValueRial: null,
          totalSellValueRial: null,
          assets: [],
        }}
      />,
    );
    const row = screen.getByText('میانگین قیمت خرید').closest('div');
    expect(row).toHaveTextContent('۵,۶۱۲,۵۰۰ تومان');
    expect(row?.textContent).not.toMatch(/[٫.]/);
  });
});

describe('PendingPickupCard', () => {
  beforeEach(() => {
    mockPortfolio.mockReset();
    mockPortfolio.mockResolvedValue({
      weightGrams: '20.000000',
      reservedPickupGrams: '5.000000',
      purityRatio: '0.750000',
      averageBuyPriceRial: null,
      totalBuyValueRial: null,
      totalSellValueRial: null,
    });
  });

  it('shows reserved undelivered pickup grams', async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <PendingPickupCard />
      </SWRConfig>,
    );
    const link = await screen.findByRole('link', { name: /طلای در انتظار تحویل/ });
    expect(link).toHaveTextContent('۵ گرم');
    expect(link).toHaveAttribute('href', '/portal/pickups');
  });
});

describe('ActiveOrders', () => {
  const now = new Date('2026-09-29T12:00:00.000+03:30');

  it('shows today orders by default', () => {
    render(<ActiveOrders orders={DEMO_ACTIVE_ORDERS} now={now} />);
    expect(screen.getAllByText(toPersianDigits('ORD-1405-0034')).length).toBeGreaterThan(0);
    expect(screen.queryByText(toPersianDigits('ORD-1405-0030'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'امروز' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the customer switch to week month and year', async () => {
    const user = userEvent.setup();
    render(<ActiveOrders orders={DEMO_ACTIVE_ORDERS} now={now} />);

    await user.click(screen.getByRole('button', { name: 'هفته' }));
    expect(screen.getAllByText(toPersianDigits('ORD-1405-0033')).length).toBeGreaterThan(0);
    expect(screen.queryByText(toPersianDigits('ORD-1405-0030'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'سال' }));
    expect(screen.getAllByText(toPersianDigits('ORD-1405-0030')).length).toBeGreaterThan(0);
  });

  it('labels buy and sell from order.side', () => {
    render(
      <ActiveOrders
        now={new Date('2026-10-01T12:00:00.000+03:30')}
        orders={[
          {
            id: 'buy-1',
            orderNumber: 'ORD-BUY',
            customerId: 'c-1',
            status: 'SUBMITTED',
            totalAmountRial: '1000.00',
            weightGrams: '1.000000',
            purityRatio: '0.750000',
            reservedAmountRial: '0.00',
            createdAt: '2026-10-01T08:00:00.000Z',
            side: 'BUY',
          },
          {
            id: 'sell-1',
            orderNumber: 'ORD-SELL',
            customerId: 'c-1',
            status: 'SUBMITTED',
            totalAmountRial: '1000.00',
            weightGrams: '1.000000',
            purityRatio: '0.750000',
            reservedAmountRial: '0.00',
            createdAt: '2026-10-01T09:00:00.000Z',
            side: 'SELL',
          },
        ]}
      />,
    );
    expect(screen.getAllByText('خرید').length).toBeGreaterThan(0);
    expect(screen.getAllByText('فروش').length).toBeGreaterThan(0);
  });

  it('shows order prices as whole toman', () => {
    render(
      <ActiveOrders
        now={new Date('2026-10-01T12:00:00.000+03:30')}
        orders={[
          {
            id: 'buy-1',
            orderNumber: 'ORD-PRICE',
            customerId: 'c-1',
            status: 'SUBMITTED',
            totalAmountRial: '58730005.70',
            weightGrams: '1.000000',
            purityRatio: '0.750000',
            reservedAmountRial: '0.00',
            createdAt: '2026-10-01T08:00:00.000Z',
            side: 'BUY',
          },
        ]}
      />,
    );
    const price = screen.getAllByText('۵,۸۷۳,۰۰۰ تومان');
    expect(price.length).toBeGreaterThan(0);
    expect(price[0]?.textContent).not.toMatch(/[٫.]/);
  });
});

describe('RecentTransactions', () => {
  const now = new Date('2026-09-29T12:00:00.000+03:30');

  it('shows today trades by default', () => {
    render(<RecentTransactions trades={DEMO_RECENT_TRADES} now={now} />);
    expect(screen.getAllByText(toPersianDigits('TRX-1405-00125')).length).toBeGreaterThan(0);
    expect(screen.queryByText(toPersianDigits('TRX-1405-00121'))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'امروز' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lets the customer switch trade ranges', async () => {
    const user = userEvent.setup();
    render(<RecentTransactions trades={DEMO_RECENT_TRADES} now={now} />);

    await user.click(screen.getByRole('button', { name: 'هفته' }));
    expect(screen.getAllByText(toPersianDigits('TRX-1405-00124')).length).toBeGreaterThan(0);
    expect(screen.queryByText(toPersianDigits('TRX-1405-00121'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'سال' }));
    expect(screen.getAllByText(toPersianDigits('TRX-1405-00121')).length).toBeGreaterThan(0);
  });

  it('shows trade prices as whole toman', () => {
    render(
      <RecentTransactions
        now={new Date('2026-09-29T12:00:00.000+03:30')}
        trades={[
          {
            ...DEMO_RECENT_TRADES[0]!,
            unitPriceRial: '58400005.70',
            totalAmountRial: '584000005.70',
          },
        ]}
      />,
    );
    expect(screen.getAllByText('۵,۸۴۰,۰۰۰ تومان').length).toBeGreaterThan(0);
    expect(screen.getAllByText('۵۸,۴۰۰,۰۰۰ تومان').length).toBeGreaterThan(0);
  });
});

describe('GoldPriceChart', () => {
  it('renders an accessible chart', () => {
    render(<GoldPriceChart series={demoPriceSeries(58420000, '1d')} period="1d" />);
    expect(screen.getByLabelText('نمودار قیمت طلای آبشده')).toBeInTheDocument();
  });
});
