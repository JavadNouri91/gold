import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from '../components/portal/assets/assets-page';
import { PortfolioValueChart } from '../components/portal/assets/portfolio-value-chart';
import { MobileBottomNavigation } from '../components/portal/mobile-bottom-navigation';
import { isRegisteredHolding, toPortfolioPosition, type PortfolioPosition } from '../lib/customer-portfolio';
import { netBookedGrams, ownedGoldGrams, portfolioValueSeries, seriesPointLabel } from '../lib/asset-chart-range';
import { formatWeight, formatWholeMoney, toPersianDigits } from '../lib/utils';
import { formatSignedRial as signed } from '../lib/portfolio-display';
import type { CurrentPrice } from '../lib/api';

jest.mock('next/navigation', () => ({
  usePathname: () => '/portal/assets',
}));

const position: PortfolioPosition = {
  weightGrams: '24.750',
  reservedPickupGrams: '0.000000',
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
    expect(seriesPointLabel('D:1404-07-26')).toBe(`${toPersianDigits('26')} مهر`);
    expect(
      netBookedGrams({ key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '2' }),
    ).toBe('6');
  });
});

describe('AssetsPage', () => {
  it('shows an empty holding without a fabricated balance or chart', () => {
    renderAssets();
    expect(screen.getByText(/هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'خرید طلا' })[0]).toHaveAttribute('href', '/portal/orders/new?side=buy');
    expect(screen.getByText(/ارزش دارایی برای نمایش نمودار ثبت نشده است/)).toBeInTheDocument();
    expect(screen.queryByText(/نمونه نمایشی/)).not.toBeInTheDocument();
    expect(screen.queryByText('۳۰ مهر')).not.toBeInTheDocument();
  });

  it('shows live value, weight, unrealized profit, and the spot price', () => {
    renderAssets({ position, price, availableRial: '1000000000' });
    const value = screen.getByRole('region', { name: 'مجموع ارزش کل دارایی' });
    expect(within(value).getByText(formatWholeMoney('6875000000'))).toBeInTheDocument();
    expect(within(value).getByText(/سود کل/)).toBeInTheDocument();
    expect(within(value).getByText(/توان خرید \(نقدی\)/)).toBeInTheDocument();
    expect(value).not.toHaveTextContent(signed(position.unrealizedPnlRial));

    const balance = screen.getByRole('region', { name: 'مجموع موجودی طلا' });
    expect(within(balance).getByText(formatWeight(position.weightGrams))).toBeInTheDocument();
    expect(within(balance).getByRole('link', { name: 'درخواست تحویل فیزیکی' })).toHaveAttribute(
      'href',
      '/portal/pickups/new',
    );

    const spot = screen.getByRole('region', { name: 'نرخ لحظه‌ای هر گرم طلا' });
    expect(within(spot).getByText(formatWholeMoney(price.normalizedValue))).toBeInTheDocument();
    expect(within(spot).getByText('بازار فعال است')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /نمودار ارزش و وزن دارایی/ })).toBeInTheDocument();
  });

  it('splits the composition pie into buying power, melted gold, and pending pickup value', () => {
    renderAssets({
      position: { ...position, reservedPickupGrams: '2.000000' },
      price,
      availableRial: '1000000000',
    });
    const composition = screen.getByRole('region', { name: 'ترکیب دارایی' });
    expect(within(composition).getByText('توان خرید')).toBeInTheDocument();
    expect(within(composition).getByText('ارزش ریالی طلای آب شده')).toBeInTheDocument();
    expect(within(composition).getByText('طلای در انتظار تحویل')).toBeInTheDocument();
    expect(within(composition).getByText(formatWholeMoney('1000000000'))).toBeInTheDocument();
    expect(within(composition).getByText(formatWholeMoney(position.marketValueRial))).toBeInTheDocument();
    expect(within(composition).getByText(formatWholeMoney('116840000'))).toBeInTheDocument();
    expect(within(composition).getByText('ارزش کل دارایی')).toBeInTheDocument();
    expect(within(composition).getByText(formatWholeMoney('6991840000'))).toBeInTheDocument();
    expect(within(composition).getByText(`(معادل ${formatWeight(position.weightGrams)} طلا)`)).toBeInTheDocument();
    expect(within(composition).getByText(`${toPersianDigits('14')}٪`)).toBeInTheDocument();
    expect(within(composition).getByText(`${toPersianDigits('84')}٪`)).toBeInTheDocument();
    expect(within(composition).getByRole('img', { name: /ترکیب دارایی/ })).toBeInTheDocument();
    expect(within(composition).getByRole('button', { name: 'مخفی کردن مبالغ' })).toBeInTheDocument();
  });

  it('includes reserved pickup grams in total gold holdings', () => {
    renderAssets({
      position: { ...position, reservedPickupGrams: '7.000000' },
      price,
    });
    const balance = screen.getByRole('region', { name: 'مجموع موجودی طلا' });
    expect(within(balance).getByText(formatWeight('31.75'))).toBeInTheDocument();
    expect(within(balance).getByRole('link', { name: 'درخواست تحویل فیزیکی' })).toHaveAttribute(
      'href',
      '/portal/pickups/new',
    );
  });

  it('shows unrealized profit as whole toman', () => {
    renderAssets({
      position: { ...position, unrealizedPnlRial: '1750000005.70' },
      price,
    });
    const value = screen.getByRole('region', { name: 'مجموع ارزش کل دارایی' });
    expect(value).toHaveTextContent('۱۷۵,۰۰۰,۰۰۰ تومان');
    expect(value).not.toHaveTextContent('۱۷۵,۰۰۰,۰۰۰.۵۷');
  });

  it('shows an unrealized loss in red with a minus sign', () => {
    renderAssets({
      position: { ...position, unrealizedPnlRial: '-1234.239', changePercent: '-1.2' },
      price,
    });
    const value = screen.getByRole('region', { name: 'مجموع ارزش کل دارایی' });
    expect(value).toHaveTextContent('۱۲۳ تومان');
    expect(value).toHaveTextContent('زیان کل');
    expect(value).toHaveTextContent('−۱.۲٪');
  });

  it('draws value and weight trend lines from booked grams at the live price plus buying power', () => {
    renderAssets({
      position,
      price,
      availableRial: '1000000000',
      valuePoints: [
        { key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '0' },
      ],
    });
    const chart = screen.getByRole('region', { name: 'نمودار ارزش و وزن دارایی' });
    expect(within(chart).getByRole('img', { name: /نمودار ارزش و وزن دارایی/ })).toBeInTheDocument();
    expect(within(chart).getByText('ارزش (تومان)')).toBeInTheDocument();
    expect(within(chart).getByText('وزن (گرم)')).toBeInTheDocument();
    expect(within(chart).getByText(/دو خط روند/)).toBeInTheDocument();
    expect(within(chart).getByText(formatWholeMoney('2445895000'))).toBeInTheDocument();
    expect(within(chart).getByText(formatWeight('24.75'))).toBeInTheDocument();
    expect(ownedGoldGrams(position.weightGrams, position.reservedPickupGrams)).toBe('24.75');
    expect(
      portfolioValueSeries(
        [{ key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '0' }],
        price.normalizedValue,
        '24.750',
        '1000000000',
      ).map((point) => ({ valueRial: point.valueRial, grams: point.grams })),
    ).toEqual([
      { valueRial: '2095375000', grams: '18.75' },
      { valueRial: '2445895000', grams: '24.75' },
    ]);
  });

  it('masks composition amounts with the privacy toggle', async () => {
    const user = userEvent.setup();
    renderAssets({
      position,
      price,
      availableRial: '1000000000',
    });
    const composition = screen.getByRole('region', { name: 'ترکیب دارایی' });
    const reveal = formatWholeMoney('1000000000');
    expect(within(composition).getByText(reveal)).toBeInTheDocument();
    await user.click(within(composition).getByRole('button', { name: 'مخفی کردن مبالغ' }));
    expect(within(composition).queryByText(reveal)).not.toBeInTheDocument();
    expect(within(composition).getAllByText('•••••••• تومان').length).toBeGreaterThan(0);
    await user.click(within(composition).getByRole('button', { name: 'نمایش مبالغ' }));
    expect(within(composition).getByText(reveal)).toBeInTheDocument();
  });

  it('places buy and sell inside the composition card', () => {
    renderAssets({ position, price });
    const composition = screen.getByRole('region', { name: 'ترکیب دارایی' });
    expect(within(composition).getByRole('link', { name: 'خرید طلا' })).toHaveAttribute(
      'href',
      '/portal/orders/new?side=buy',
    );
    expect(within(composition).getByRole('link', { name: 'فروش طلا' })).toHaveAttribute(
      'href',
      '/portal/orders/new?side=sell',
    );
    expect(screen.queryByRole('region', { name: 'خرید و فروش' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'تغییرات وزن دارایی' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'نمودار ارزش و وزن دارایی' })).toBeInTheDocument();
  });

  it('does not list recent trades on the assets page', () => {
    renderAssets();
    expect(screen.queryByRole('heading', { name: 'آخرین معاملات' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'مشاهده همه' })).not.toBeInTheDocument();
  });

  it('asks to retry when the holding request fails', () => {
    renderAssets({ holdingError: true });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('اطلاعات دارایی در حال حاضر قابل دریافت نیست.');
    expect(within(alert).getByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });
});

describe('PortfolioValueChart', () => {
  it('changes the selected range', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [range, setRange] = useState<'7d' | '30d' | '3m' | '6m' | '1y' | 'all'>('all');
      return <PortfolioValueChart range={range} onRangeChange={setRange} />;
    }
    render(<Harness />);
    expect(screen.getByText(/در بازه همه/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '۳ ماه' }));
    expect(screen.getByText(/در بازه ۳ ماه/)).toBeInTheDocument();
  });
});

describe('MobileBottomNavigation', () => {
  it('marks assets active and keeps buy/sell prominent', () => {
    render(<MobileBottomNavigation />);
    expect(screen.getByRole('link', { name: 'دارایی' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'خرید/فروش' })).toHaveAttribute('href', '/portal/orders/new');
  });
});
