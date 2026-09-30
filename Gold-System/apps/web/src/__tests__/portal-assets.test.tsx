import React, { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssetsPage } from '../components/portal/assets/assets-page';
import { PortfolioValueChart } from '../components/portal/assets/portfolio-value-chart';
import { MobileBottomNavigation } from '../components/portal/mobile-bottom-navigation';
import { isRegisteredHolding, loadCustomerPosition, type PortfolioPosition } from '../lib/customer-portfolio';
import { previewPortfolioHistory, summarizePreviewRial } from '../lib/portfolio-history-preview';
import { moneyTone } from '../lib/portfolio-display';
import { formatRial, formatWeight } from '../lib/utils';
import type { Trade } from '../lib/api';

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
  realizedPnlRial: '0',
  unrealizedPnlRial: '236000000',
  totalBuyValueRial: '1400000000',
  totalSellValueRial: null,
  assets: [{ id: 'melted', label: 'طلای آبشده', weightGrams: '24.750', share: 100 }],
};

function renderAssets(overrides: Partial<React.ComponentProps<typeof AssetsPage>> = {}) {
  const series = previewPortfolioHistory('1m');
  return render(
    <AssetsPage
      position={null}
      chartSeries={series}
      chartPeriod="1m"
      onChartPeriod={() => undefined}
      performanceSeries={series}
      performancePeriod="1m"
      onPerformancePeriod={() => undefined}
      trades={[]}
      {...overrides}
    />,
  );
}

describe('customer portfolio availability', () => {
  it('does not invent a personal gold balance', () => {
    expect(loadCustomerPosition()).toBeNull();
    expect(isRegisteredHolding(null)).toBe(false);
    expect(isRegisteredHolding({ ...position, weightGrams: '0.000' })).toBe(false);
  });

  it('classifies profit and loss signs without reparsing money', () => {
    expect(moneyTone('236000000')).toBe('positive');
    expect(moneyTone('-10')).toBe('negative');
    expect(moneyTone('0')).toBe('neutral');
  });
});

describe('AssetsPage', () => {
  it('shows the empty holding state instead of a sample balance', () => {
    renderAssets();
    const balance = screen.getByRole('region', { name: 'موجودی طلای آبشده' });
    expect(within(balance).getByText(/هنوز طلای آبشده‌ای در دارایی شما ثبت نشده است/)).toBeInTheDocument();
    expect(within(balance).getByRole('link', { name: 'خرید طلا' })).toHaveAttribute(
      'href',
      '/portal/orders/new?side=buy',
    );
    expect(within(balance).queryByText(formatWeight('24.75'))).not.toBeInTheDocument();
    expect(screen.getByText(/ارزش روز پس از ثبت موجودی/)).toBeInTheDocument();
  });

  it('renders a provided position without dropping server figures', () => {
    renderAssets({ position });
    const balance = screen.getByRole('region', { name: 'موجودی طلای آبشده' });
    expect(within(balance).getByText(formatWeight(position.weightGrams))).toBeInTheDocument();
    expect(within(balance).getByText('750')).toBeInTheDocument();
    expect(within(balance).getByText(formatRial(position.marketValueRial))).toBeInTheDocument();
    expect(screen.getByText('ارزش خرید کل')).toBeInTheDocument();
    expect(screen.queryByText('ارزش فروش کل')).not.toBeInTheDocument();
  });

  it('labels preview charts and keeps weight history distinct from price', () => {
    renderAssets();
    expect(screen.getAllByText(/نمونه نمایشی/).length).toBeGreaterThan(0);
    expect(screen.getByText(/این نمودار قیمت بازار طلا نیست/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /نمودار ارزش دارایی|آخرین ارزش/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'دانلود گزارش' }).every((button) => button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByRole('link', { name: 'مشاهده همه' })).toHaveAttribute('href', '/portal/trades');
  });

  it('shows an empty trade state and a real trade card', () => {
    renderAssets();
    expect(screen.getByText('هنوز معامله‌ای ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'شروع معامله' })).toHaveAttribute('href', '/portal/orders/new');
  });

  it('lists the customer’s own trades as cards', () => {
    const trade = {
      id: 't-1',
      tradeNumber: 'TR-1',
      weightGrams: '10',
      unitPriceRial: '58400000',
      totalAmountRial: '584000000',
      status: 'COMPLETED',
      createdAt: '2026-09-25T08:00:00.000Z',
      side: 'SELL',
    } satisfies Partial<Trade> & { side: 'SELL' };
    renderAssets({ trades: [trade] });
    expect(screen.getByText('فروش')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /فروش/ }).getAttribute('href')).toBe('/portal/trades/t-1');
    expect(screen.queryByText('هنوز معامله‌ای ثبت نشده است.')).not.toBeInTheDocument();
  });

  it('shows a retry when asset price data fails', () => {
    renderAssets({ priceError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('اطلاعات دارایی در حال حاضر قابل دریافت نیست.');
    expect(screen.getByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });
});

describe('PortfolioValueChart', () => {
  it('switches the preview window', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [period, setPeriod] = useState<'1m' | '3m' | '6m' | '1y'>('1m');
      const series = previewPortfolioHistory(period);
      return <PortfolioValueChart series={series} period={period} onPeriodChange={setPeriod} />;
    }
    render(<Harness />);
    expect(screen.getByText('۳۰ مهر')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '۳ ماه' }));
    expect(screen.getByText('مهر')).toBeInTheDocument();
    expect(screen.queryByText('۳۰ مهر')).not.toBeInTheDocument();
  });
});

describe('preview history', () => {
  it('summarizes the isolated series with integer rials', () => {
    const series = previewPortfolioHistory('1m');
    const summary = summarizePreviewRial(series.points);
    expect(series.source).toBe('preview');
    expect(series.points).toHaveLength(7);
    expect(summary?.min).toBe('1000000000');
    expect(summary?.max).toBe('2500000000');
    expect(summary?.last).toBe('2475000000');
  });
});

describe('MobileBottomNavigation', () => {
  it('marks assets active and keeps buy/sell prominent', () => {
    render(<MobileBottomNavigation />);
    expect(screen.getByRole('link', { name: 'دارایی' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'خرید/فروش' })).toHaveAttribute('href', '/portal/orders/new');
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/portal/dashboard');
    expect(screen.getByRole('link', { name: 'معاملات' })).toHaveAttribute('href', '/portal/trades');
    expect(screen.getByRole('link', { name: 'پروفایل' })).toHaveAttribute('href', '/portal/profile');
  });
});
