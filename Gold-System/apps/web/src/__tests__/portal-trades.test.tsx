import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MyTradesPage } from '../components/portal/trades/my-trades-page';
import { activityBounds } from '../lib/activity-range';
import { activityBucketLabel } from '../lib/activity-bucket-label';
import type { ActivitySummary } from '../lib/api';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const summary: ActivitySummary = {
  pnl: {
    supported: false,
    realizedRial: null,
    unrealizedRial: null,
    totalRial: null,
    changePercent: null,
  },
  volume: { grams: '40.000000', count: 2, unit: 'GRAM' },
  buy: { amountRial: '1750000000.00', grams: '30.000000', count: 1 },
  sell: { amountRial: '587000000.00', grams: '10.000000', count: 1 },
  unclassified: { amountRial: '0.00', grams: '0.000000', count: 0 },
  distribution: {
    unit: 'GRAM',
    segments: [
      { id: 'BUY', grams: '30.000000', share: '75.0' },
      { id: 'SELL', grams: '10.000000', share: '25.0' },
    ],
  },
  series: [{ key: 'M:1405-07', buyGrams: '30.000000', sellGrams: '10.000000', unclassifiedGrams: '0.000000' }],
  purities: ['0.750000'],
  excludedCount: 1,
  totalsBasis: 'booked',
  meta: { page: 1, limit: 10, total: 2, totalPages: 1 },
  hasAny: true,
};

function renderPage(overrides: Partial<React.ComponentProps<typeof MyTradesPage>> = {}) {
  return render(
    <MyTradesPage
      preset="30d"
      onPreset={() => undefined}
      customFrom=""
      customTo=""
      onCustomFrom={() => undefined}
      onCustomTo={() => undefined}
      bucket="month"
      onBucket={() => undefined}
      side=""
      status=""
      purity=""
      search=""
      onSide={() => undefined}
      onStatus={() => undefined}
      onPurity={() => undefined}
      onSearch={() => undefined}
      onClearFilters={() => undefined}
      page={1}
      limit={10}
      onPage={() => undefined}
      onLimit={() => undefined}
      summary={summary}
      summaryLoading={false}
      summaryError={false}
      onRetrySummary={() => undefined}
      list={{
        data: [
          {
            id: 'order-1',
            orderNumber: 'ORD-000125',
            side: 'BUY',
            status: 'COMPLETED',
            weightGrams: '10.000000',
            purityRatio: '0.750000',
            unitPriceRial: '58140000.000000',
            totalAmountRial: '581400000.00',
            createdAt: '2026-09-15T11:02:00.000Z',
            submittedAt: null,
            confirmedAt: null,
            reservedAmountRial: '0.00',
            countsTowardVolume: true,
            tradeId: null,
            tradeNumber: null,
            quotationId: null,
            quotationNumber: null,
            wageAmount: null,
            taxAmount: null,
            paymentMethods: [],
            settlementStatus: null,
          },
        ],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      }}
      listLoading={false}
      listError={false}
      onRetryList={() => undefined}
      rangeReady
      {...overrides}
    />,
  );
}

describe('activity range', () => {
  it('builds a Tehran window for the default preset', () => {
    const bounds = activityBounds('30d', { from: '', to: '' }, new Date('2026-09-30T12:00:00.000Z'));
    expect(bounds?.from.endsWith('+03:30')).toBe(true);
    expect(bounds?.to.startsWith('2026-09-30')).toBe(true);
  });

  it('labels Jalali buckets without recalculating money', () => {
    expect(activityBucketLabel('M:1405-07')).toContain('مهر');
  });
});

describe('MyTradesPage', () => {
  it('shows server totals and does not invent profit', () => {
    renderPage();
    expect(screen.getByText('سود و زیان مشتری ثبت نشده')).toBeInTheDocument();
    expect(screen.queryByText(/\+۷\.۸/)).not.toBeInTheDocument();
    expect(screen.getByText('مجموع خرید')).toBeInTheDocument();
    expect(screen.getByText('مجموع فروش')).toBeInTheDocument();
    expect(screen.getAllByText('ORD-000125').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'جزئیات' })).toHaveAttribute('href', '/portal/orders/order-1');
  });

  it('shows the onboarding state when the customer has no transactions', () => {
    renderPage({
      summary: {
        ...summary,
        hasAny: false,
        volume: { grams: '0.000000', count: 0, unit: 'GRAM' },
        series: [],
        distribution: { unit: 'GRAM', segments: [] },
        excludedCount: 0,
      },
      list: { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } },
    });
    expect(screen.getByText('هنوز معامله‌ای ثبت نکرده‌اید.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'خرید طلا' })).toHaveAttribute('href', '/portal/orders/new?side=buy');
    expect(screen.queryByText('نمودار حجم معاملات')).not.toBeInTheDocument();
  });

  it('keeps summary and list errors separate', async () => {
    const user = userEvent.setup();
    const onRetrySummary = jest.fn();
    const onRetryList = jest.fn();
    renderPage({
      summary: undefined,
      summaryError: true,
      list: undefined,
      listError: true,
      onRetrySummary,
      onRetryList,
    });
    expect(screen.getByText('اطلاعات معاملات در حال حاضر قابل دریافت نیست.')).toBeInTheDocument();
    expect(screen.getByText('لیست معاملات قابل دریافت نیست.')).toBeInTheDocument();
    const retries = screen.getAllByRole('button', { name: 'تلاش مجدد' });
    await user.click(retries[0]!);
    await user.click(retries[1]!);
    expect(onRetrySummary).toHaveBeenCalledTimes(1);
    expect(onRetryList).toHaveBeenCalledTimes(1);
  });
});
