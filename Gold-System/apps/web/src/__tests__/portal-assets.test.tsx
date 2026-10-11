import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from '../components/portal/assets/assets-page';
import { PortfolioValueChart } from '../components/portal/assets/portfolio-value-chart';
import { MobileBottomNavigation } from '../components/portal/mobile-bottom-navigation';
import { isRegisteredHolding, toPortfolioPosition, type PortfolioPosition } from '../lib/customer-portfolio';
import { netBookedGrams, seriesPointLabel } from '../lib/asset-chart-range';
import { formatRial, formatWeight, toPersianDigits } from '../lib/utils';
import { formatSignedRial as signed } from '../lib/portfolio-display';
import type { ActivityTransaction, CurrentPrice } from '../lib/api';

jest.mock('next/navigation', () => ({
  usePathname: () => '/portal/assets',
}));

const position: PortfolioPosition = {
  weightGrams: '24.750',
  purityLabel: '750',
  averageBuyPriceRial: '56125000',
  marketValueRial: '5875000000',
  changeRial: '236000000',
  changePercent: '4.7',
  realizedPnlRial: null,
  unrealizedPnlRial: '236000000',
  totalBuyValueRial: '1400000000',
  totalSellValueRial: null,
  assets: [{ id: 'melted', label: 'طلای آبشده', weightGrams: '24.750', share: 100 }],
};

const price: CurrentPrice = {
  id: 'price-1',
  rawValue: '58420000',
  normalizedValue: '58420000',
  unit: 'RIAL_PER_GRAM',
  capturedAt: '2026-10-10T08:30:00.000Z',
  validityStatus: 'VALID',
};

function renderAssets(overrides: Partial<React.ComponentProps<typeof AssetsPage>> = {}) {
  return render(
    <AssetsPage
      position={null}
      range="all"
      onRangeChange={() => undefined}
      weightPoints={[]}
      transactions={[]}
      {...overrides}
    />,
  );
}

describe('customer portfolio valuation', () => {
  it('prices booked grams with the live price and keeps unrealized separate from realized', () => {
    const valued = toPortfolioPosition(
      {
        weightGrams: '10',
        purityRatio: '0.750000',
        averageBuyPriceRial: '50000000',
        totalBuyValueRial: '500000000',
        totalSellValueRial: null,
      },
      '60000000',
    );
    expect(isRegisteredHolding(valued)).toBe(true);
    expect(valued?.marketValueRial).toBe('600000000');
    expect(valued?.unrealizedPnlRial).toBe('100000000');
    expect(valued?.realizedPnlRial).toBeNull();
    expect(valued?.purityLabel).toBe('750');
  });

  it('labels activity buckets and nets booked grams only', () => {
    expect(seriesPointLabel('M:1404-07')).toBe('مهر');
    expect(
      netBookedGrams({ key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '2' }),
    ).toBe('6');
  });
});

describe('AssetsPage', () => {
  it('shows an empty holding without a fabricated balance or chart', () => {
    renderAssets();
    expect(screen.getByText(/هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'خرید طلا' })).toHaveAttribute('href', '/portal/orders/new?side=buy');
    expect(screen.getByText(/تاریخچه ارزش دارایی ثبت نشده است/)).toBeInTheDocument();
    expect(screen.queryByText(/نمونه نمایشی/)).not.toBeInTheDocument();
    expect(screen.queryByText('۳۰ مهر')).not.toBeInTheDocument();
  });

  it('shows live value, weight, unrealized profit, and the spot price', () => {
    renderAssets({ position, price });
    const value = screen.getByRole('region', { name: 'ارزش روز دارایی' });
    expect(within(value).getByText(formatRial(position.marketValueRial))).toBeInTheDocument();
    expect(within(value).getByText(/مقایسه با ماه گذشته در دسترس نیست/)).toBeInTheDocument();
    expect(value).not.toHaveTextContent(signed(position.unrealizedPnlRial));

    const balance = screen.getByRole('region', { name: 'موجودی طلای آبشده' });
    expect(within(balance).getByText(formatWeight(position.weightGrams))).toBeInTheDocument();
    expect(within(balance).getByText(`عیار ${toPersianDigits('750')}`)).toBeInTheDocument();

    const unrealized = screen.getByRole('region', { name: 'سود و زیان تحقق‌نیافته' });
    expect(unrealized).toHaveTextContent(signed(position.unrealizedPnlRial));
    expect(within(unrealized).getByText(/ارزش روز منهای بهای خرید مانده/)).toBeInTheDocument();
    expect(within(unrealized).queryByText('سود و زیان تحقق‌یافته')).not.toBeInTheDocument();

    expect(screen.getByText(formatRial(price.normalizedValue))).toBeInTheDocument();
    expect(screen.getByText('بازار فعال')).toBeInTheDocument();
  });

  it('draws weight changes from booked activity and keeps the value chart empty', () => {
    renderAssets({
      weightPoints: [
        { key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '1.000000' },
      ],
    });
    const weight = screen.getByRole('region', { name: 'تغییرات وزن دارایی' });
    expect(within(weight).getByText('مهر')).toBeInTheDocument();
    expect(within(weight).getByText(formatWeight('6'))).toBeInTheDocument();
    expect(within(weight).getByText(/سفارش‌های بدون نوع خرید یا فروش/)).toBeInTheDocument();
    expect(screen.getByText(/تاریخچه ارزش دارایی ثبت نشده است/)).toBeInTheDocument();
  });

  it('lists the customer activity and only links to existing actions', () => {
    const row: ActivityTransaction = {
      id: 'ord-1',
      orderNumber: 'ORD-1',
      side: 'SELL',
      status: 'COMPLETED',
      weightGrams: '5',
      purityRatio: '0.750000',
      unitPriceRial: '58000000',
      totalAmountRial: '290000000',
      createdAt: '2026-10-01T08:00:00.000Z',
      submittedAt: null,
      confirmedAt: '2026-10-02T08:00:00.000Z',
      reservedAmountRial: null,
      countsTowardVolume: true,
      tradeId: null,
      tradeNumber: null,
      quotationId: null,
      quotationNumber: null,
      wageAmount: null,
      taxAmount: null,
      paymentMethods: [],
      settlementStatus: null,
    };
    renderAssets({ transactions: [row] });
    expect(screen.getAllByText('فروش').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link').some((link) => link.getAttribute('href') === '/portal/orders/ord-1')).toBe(
      true,
    );
    expect(screen.getByRole('link', { name: 'مشاهده همه' })).toHaveAttribute('href', '/portal/trades');
    expect(screen.getByRole('link', { name: /گزارش معاملات/ })).toHaveAttribute('href', '/portal/trades');
    expect(screen.getByRole('link', { name: /واریز تومان/ })).toHaveAttribute('href', '/portal/payments');
    expect(screen.queryByRole('button', { name: 'دانلود گزارش' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'برداشت تومان' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'گزارش سود و زیان' })).not.toBeInTheDocument();
  });

  it('asks to retry when the holding request fails', () => {
    renderAssets({ holdingError: true });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('اطلاعات دارایی در حال حاضر قابل دریافت نیست.');
    expect(within(alert).getByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });
});

describe('PortfolioValueChart', () => {
  it('changes the selected range without drawing a series', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [range, setRange] = useState<'7d' | '30d' | '3m' | '6m' | '1y' | 'all'>('all');
      return <PortfolioValueChart range={range} onRangeChange={setRange} />;
    }
    render(<Harness />);
    expect(screen.getByText(/در بازه همه/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '۳ ماه' }));
    expect(screen.getByText(/در بازه ۳ ماه/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /آخرین ارزش/ })).not.toBeInTheDocument();
  });
});

describe('MobileBottomNavigation', () => {
  it('marks assets active and keeps buy/sell prominent', () => {
    render(<MobileBottomNavigation />);
    expect(screen.getByRole('link', { name: 'دارایی' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'خرید/فروش' })).toHaveAttribute('href', '/portal/orders/new');
  });
});
