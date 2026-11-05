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
import { DashboardHero } from '../components/portal/dashboard-hero';
import { demoPriceSeries, DEMO_ACTIVE_ORDERS, DEMO_RECENT_TRADES } from '../lib/portal-demo';
import { toPersianDigits } from '../lib/utils';
import { toPortfolioPosition } from '../lib/customer-portfolio';
import { netWorthRial } from '../components/portal/dashboard-hero';
import { assetCompositionSlices } from '../components/portal/assets/asset-composition';

const mockPortfolio = jest.fn();

describe('pending purchase asset breakdown', () => {
  const position = toPortfolioPosition(
    {
      weightGrams: '0',
      pendingPurchaseGrams: '3',
      pendingPurchaseAmountRial: '1800000',
      purityRatio: null,
      averageBuyPriceRial: null,
      totalBuyValueRial: null,
      totalSellValueRial: null,
    },
    '700000',
  );

  it('shows pending-only weight separately from confirmed holdings', () => {
    render(<PortfolioCard position={position} />);
    expect(screen.getByText('طلای در انتظار تأیید').closest('div')).toHaveTextContent('۳ گرم');
    expect(screen.getByText('موجودی طلای تأییدشده').closest('div')).toHaveTextContent('۰ گرم');
    expect(screen.getByText('ارزش روز طلای تأییدشده').closest('div')).not.toHaveTextContent(
      '۲۱۰,۰۰۰',
    );
    expect(screen.getByText('میانگین خرید')).toBeInTheDocument();
  });

  it('shows confirmed holdings and market value when active reservations reduce sellable weight', () => {
    const positionWithReservations = toPortfolioPosition(
      {
        weightGrams: '0',
        confirmedWeightGrams: '3.813',
        pendingPurchaseGrams: '5',
        pendingPurchaseAmountRial: '1800000',
        purityRatio: '0.750000',
        averageBuyPriceRial: '266616450',
        totalBuyValueRial: '1016608523.85',
        totalSellValueRial: null,
      },
      '300000000',
    );
    render(<PortfolioCard position={positionWithReservations} />);
    expect(screen.getByText('موجودی طلای تأییدشده').closest('div')).toHaveTextContent(
      toPersianDigits('3.813 گرم'),
    );
    expect(screen.getByText('ارزش روز طلای تأییدشده').closest('div')).toHaveTextContent(
      '۱۱۴,۳۹۰,۰۰۰ تومان',
    );
  });

  it('counts the paid amount once without valuing pending gold at market price', () => {
    expect(position?.marketValueRial).toBeNull();
    expect(netWorthRial(null, position)).toBe('1800000');
    const slices = assetCompositionSlices('200000', '0', '0', position?.pendingPurchaseAmountRial);
    expect(slices.find((slice) => slice.id === 'pending-purchase')?.amountRial).toBe('1800000');
    expect(slices.reduce((total, slice) => total + Number(slice.amountRial), 0)).toBe(2000000);
  });

  it.each([undefined, '0', '0.000000'])(
    'hides the pending row for absent or zero weight (%s)',
    (grams) => {
      render(<PortfolioCard position={{ ...position!, pendingPurchaseGrams: grams }} />);
      expect(screen.queryByText('طلای در انتظار تأیید')).not.toBeInTheDocument();
    },
  );

  it('hides pending weight without a paid reservation', () => {
    render(<PortfolioCard position={{ ...position!, pendingPurchaseAmountRial: '0.00' }} />);
    expect(screen.queryByText('طلای در انتظار تأیید')).not.toBeInTheDocument();
  });

  it('removes the pending row when refreshed balances reflect a resolved order', () => {
    const { rerender } = render(<PortfolioCard position={position} />);
    expect(screen.getByText('طلای در انتظار تأیید')).toBeInTheDocument();
    rerender(
      <PortfolioCard
        position={{
          ...position!,
          weightGrams: '3',
          confirmedWeightGrams: '3',
          pendingPurchaseGrams: '0',
          pendingPurchaseAmountRial: '0',
        }}
      />,
    );
    expect(screen.queryByText('طلای در انتظار تأیید')).not.toBeInTheDocument();
    expect(screen.getByText('موجودی طلای تأییدشده').closest('div')).toHaveTextContent('۳ گرم');
  });
});

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
    expect(screen.getByText('کاربر فعال')).toBeInTheDocument();
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
    expect(screen.getByText('واریز و برداشت').closest('a')).toHaveAttribute(
      'href',
      '/portal/payments',
    );
    expect(screen.getByText('خرید سریع طلا').closest('a')).toHaveAttribute(
      'href',
      '/portal/orders/new?side=buy',
    );
    expect(screen.getByText('فروش سریع طلا').closest('a')).toHaveAttribute(
      'href',
      '/portal/orders/new?side=sell',
    );
    expect(screen.getByText('درخواست تحویل حضوری').closest('a')).toHaveAttribute(
      'href',
      '/portal/pickups/new',
    );
  });
});

describe('DashboardHero', () => {
  it('sums rial purchasing power and gold market value as whole toman', () => {
    render(
      <DashboardHero
        account={{
          id: 'acc-1',
          customerId: 'c-1',
          status: 'ACTIVE',
          creditLimitRial: '0',
          reservedCreditRial: '0',
          consumedCreditRial: '0',
          creditLimitGoldRial: '0',
          reservedCreditGoldRial: '0',
          consumedCreditGoldRial: '0',
          availableCreditRial: '1.00',
          availableRial: '1000000000.00',
        }}
        position={{
          weightGrams: '10.000000',
          confirmedWeightGrams: '10.000000',
          reservedPickupGrams: '0',
          purityLabel: '750',
          averageBuyPriceRial: null,
          marketValueRial: '500000000',
          changeRial: '12000000',
          changePercent: '1.2',
          realizedPnlRial: null,
          unrealizedPnlRial: null,
          totalBuyValueRial: null,
          totalSellValueRial: null,
          assets: [],
        }}
      />,
    );
    expect(screen.getByText('کل دارایی‌ها (ریالی + ارزش طلا)')).toBeInTheDocument();
    expect(screen.getByText('۱۵۰,۰۰۰,۰۰۰ تومان')).toBeInTheDocument();
    expect(screen.getByText(/سود امروز/)).toHaveTextContent('+۱.۲٪');
  });
});

describe('PortfolioCard', () => {
  it('shows the empty holding state until a booked position exists', () => {
    render(<PortfolioCard />);
    expect(screen.getByText('هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByText('دارایی طلای من')).toBeInTheDocument();
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
    const row = screen.getByText('میانگین خرید').closest('div');
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

  it('shows a compact empty state when there are no orders', () => {
    render(<ActiveOrders orders={[]} now={now} />);
    expect(screen.getByText('در حال حاضر سفارش باز و معلقی ندارید')).toBeInTheDocument();
  });

  it('lets the customer switch to week month and year', async () => {
    const user = userEvent.setup();
    render(<ActiveOrders orders={DEMO_ACTIVE_ORDERS} now={now} />);

    await user.click(screen.getByRole('button', { name: 'هفته' }));
    expect(screen.getAllByText(toPersianDigits('ORD-1405-0033')).length).toBeGreaterThan(0);
    expect(screen.queryByText(toPersianDigits('ORD-1405-0030'))).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'سال' }));
    expect(screen.getAllByText(toPersianDigits('ORD-1405-0032')).length).toBeGreaterThan(0);
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
    expect(screen.getAllByText(toPersianDigits('TRX-1405-00123')).length).toBeGreaterThan(0);
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
