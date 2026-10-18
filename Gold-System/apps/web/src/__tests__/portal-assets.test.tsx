import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from '../components/portal/assets/assets-page';
import { PortfolioValueChart } from '../components/portal/assets/portfolio-value-chart';
import { MobileBottomNavigation } from '../components/portal/mobile-bottom-navigation';
import { isRegisteredHolding, toPortfolioPosition, type PortfolioPosition } from '../lib/customer-portfolio';
import { netBookedGrams, ownedGoldGrams, portfolioValueSeries, seriesPointLabel } from '../lib/asset-chart-range';
import { formatRial, formatWeight, formatWholeMoney, toPersianDigits } from '../lib/utils';
import { formatSignedRial as signed, formatSignedWholeRial } from '../lib/portfolio-display';
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
      weightBucket="month"
      onWeightBucketChange={() => undefined}
      weightPoints={[]}
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
    renderAssets({ position, price });
    const value = screen.getByRole('region', { name: 'ارزش روز دارایی' });
    expect(within(value).getByText(formatRial(position.marketValueRial))).toBeInTheDocument();
    expect(within(value).getByText(/مقایسه با ماه گذشته در دسترس نیست/)).toBeInTheDocument();
    expect(value).not.toHaveTextContent(signed(position.unrealizedPnlRial));

    const balance = screen.getByRole('region', { name: 'موجودی طلای آبشده' });
    expect(within(balance).getByText(formatWeight(position.weightGrams))).toBeInTheDocument();
    expect(within(balance).getByText(`عیار ${toPersianDigits('750')}`)).toBeInTheDocument();

    const pendingPickup = screen.getByRole('region', { name: 'طلای در انتظار تحویل' });
    expect(within(pendingPickup).getByText(formatWeight(position.reservedPickupGrams))).toBeInTheDocument();
    expect(within(pendingPickup).getByText(/درخواست تحویل حضوریِ بازی ندارید/)).toBeInTheDocument();

    const unrealized = screen.getByRole('region', { name: 'سود و زیان تحقق‌نیافته' });
    expect(unrealized).toHaveTextContent(formatSignedWholeRial(position.unrealizedPnlRial));
    expect(within(unrealized).getByText(/ارزش روز منهای بهای خرید مانده/)).toBeInTheDocument();
    expect(within(unrealized).queryByText('سود و زیان تحقق‌یافته')).not.toBeInTheDocument();

    const spot = screen.getByRole('region', { name: 'قیمت لحظه‌ای هر گرم' });
    expect(within(spot).getByText(formatRial(price.normalizedValue))).toBeInTheDocument();
    expect(screen.getByText('بازار فعال')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /نمودار ارزش دارایی/ })).toBeInTheDocument();
  });

  it('splits the composition pie into buying power, melted gold, and pending pickup value', () => {
    renderAssets({
      position: { ...position, reservedPickupGrams: '2.000000' },
      price,
      availableRial: '1000000000',
    });
    const composition = screen.getByRole('region', { name: 'ترکیب دارایی' });
    expect(within(composition).getByText('توان خرید')).toBeInTheDocument();
    expect(within(composition).getByText('ارزش ریالی طلای آب‌شده')).toBeInTheDocument();
    expect(within(composition).getByText('ارزش ریالی طلای در انتظار تحویل')).toBeInTheDocument();
    expect(within(composition).getByText(formatRial('1000000000'))).toBeInTheDocument();
    expect(within(composition).getByText(formatRial(position.marketValueRial))).toBeInTheDocument();
    expect(within(composition).getByText(formatRial('116840000'))).toBeInTheDocument();
    expect(within(composition).getByRole('img', { name: /ترکیب دارایی/ })).toBeInTheDocument();
  });

  it('shows reserved undelivered pickup grams on assets summary', () => {
    renderAssets({
      position: { ...position, reservedPickupGrams: '7.000000' },
      price,
    });
    const pendingPickup = screen.getByRole('region', { name: 'طلای در انتظار تحویل' });
    expect(within(pendingPickup).getByText(formatWeight('7.000000'))).toBeInTheDocument();
    expect(within(pendingPickup).getByText(/رزرو‌شده برای تحویل حضوری/)).toBeInTheDocument();
    expect(within(pendingPickup).getByRole('link', { name: 'مشاهده درخواست‌ها' })).toHaveAttribute(
      'href',
      '/portal/pickups',
    );
  });

  it('shows unrealized profit as whole toman', () => {
    renderAssets({
      position: { ...position, unrealizedPnlRial: '1750000005.70' },
      price,
    });
    const unrealized = screen.getByRole('region', { name: 'سود و زیان تحقق‌نیافته' });
    expect(unrealized).toHaveTextContent('۱۷۵,۰۰۰,۰۰۰ تومان');
    expect(unrealized).not.toHaveTextContent('+');
    expect(unrealized).not.toHaveTextContent('۱۷۵,۰۰۰,۰۰۰.۵۷');
  });

  it('shows an unrealized loss in red with a minus sign', () => {
    renderAssets({
      position: { ...position, unrealizedPnlRial: '-1234.239', changePercent: '-1.2' },
      price,
    });
    const unrealized = screen.getByRole('region', { name: 'سود و زیان تحقق‌نیافته' });
    const amount = within(unrealized).getByText(/۱۲۳ تومان/);
    expect(amount).toHaveClass('text-[#DC2626]');
    expect(amount).toHaveTextContent('−۱۲۳ تومان');
    expect(amount).toHaveTextContent('(−۱.۲٪)');
    expect(amount).not.toHaveTextContent('+');
  });

  it('draws weight changes from booked activity', () => {
    renderAssets({
      weightPoints: [
        { key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '1.000000' },
      ],
    });
    const weight = screen.getByRole('region', { name: 'تغییرات وزن دارایی' });
    expect(within(weight).getByText('مهر')).toBeInTheDocument();
    expect(within(weight).getByText(formatWeight('6'))).toBeInTheDocument();
    expect(within(weight).getByText(/سفارش‌های بدون نوع خرید یا فروش/)).toBeInTheDocument();
  });

  it('draws the value chart from booked grams at the live price plus buying power', () => {
    renderAssets({
      position,
      price,
      availableRial: '1000000000',
      valuePoints: [
        { key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '0' },
      ],
    });
    const chart = screen.getByRole('region', { name: 'نمودار ارزش دارایی' });
    const plot = within(chart).getByRole('img', { name: /نمودار ارزش دارایی/ });
    expect(plot).toBeInTheDocument();
    expect(within(chart).getByText(/قیمت لحظه‌ای/)).toBeInTheDocument();
    jest.spyOn(plot, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 640,
      bottom: 200,
      width: 640,
      height: 200,
      toJSON: () => ({}),
    });
    fireEvent.pointerMove(plot, { clientX: 12, clientY: 80 });
    expect(within(chart).getByRole('status')).toHaveTextContent('شروع');
    expect(within(chart).getByRole('status')).toHaveTextContent(formatWholeMoney('2095375000'));
    expect(ownedGoldGrams(position.weightGrams, position.reservedPickupGrams)).toBe('24.75');
    expect(
      portfolioValueSeries(
        [{ key: 'M:1404-07', buyGrams: '10.000000', sellGrams: '4.000000', unclassifiedGrams: '0' }],
        price.normalizedValue,
        '24.750',
        '1000000000',
      ).map((point) => point.valueRial),
    ).toEqual(['2095375000', '2445895000']);
  });

  it('lets the customer group weight changes by day, week, month, or quarter', async () => {
    const user = userEvent.setup();
    const onWeightBucketChange = jest.fn();
    renderAssets({ onWeightBucketChange });
    const weight = screen.getByRole('region', { name: 'تغییرات وزن دارایی' });
    expect(within(weight).getByRole('button', { name: 'ماهانه' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(weight).getByRole('button', { name: 'روزانه' }));
    expect(onWeightBucketChange).toHaveBeenCalledWith('day');
    await user.click(within(weight).getByRole('button', { name: 'هفتگی' }));
    expect(onWeightBucketChange).toHaveBeenCalledWith('week');
    await user.click(within(weight).getByRole('button', { name: 'فصلی' }));
    expect(onWeightBucketChange).toHaveBeenCalledWith('quarter');
  });

  it('places buy and sell to the left of weight changes', () => {
    renderAssets({ position, price });
    const trade = screen.getByRole('region', { name: 'خرید و فروش' });
    expect(within(trade).getByRole('link', { name: 'خرید طلا' })).toHaveAttribute('href', '/portal/orders/new?side=buy');
    expect(within(trade).getByRole('link', { name: 'فروش طلا' })).toHaveAttribute('href', '/portal/orders/new?side=sell');
    expect(within(trade).getByText(formatRial(price.normalizedValue))).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'تغییرات وزن دارایی' })).toBeInTheDocument();
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
