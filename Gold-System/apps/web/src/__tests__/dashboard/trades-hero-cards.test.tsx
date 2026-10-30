import React from 'react';
import { render, screen } from '@testing-library/react';
import { TradeHeroCards } from '@/components/dashboard/trading-management/trade-hero-cards';
import type { TradeSummary } from '@/lib/internal-api';

const SUMMARY: TradeSummary = {
  totalTrades: 4,
  confirmedTrades: 3,
  reversedTrades: 1,
  totalWeightGrams: '30.000000',
  totalTurnoverRial: '300.00',
  buy: { count: 2, weightGrams: '20.000000', turnoverRial: '200.00' },
  sell: { count: 1, weightGrams: '10.000000', turnoverRial: '100.00' },
  buyRatioPercent: 66.7,
};

describe('TradeHeroCards', () => {
  it('renders the four card titles', () => {
    render(<TradeHeroCards summary={SUMMARY} />);

    expect(screen.getByText('حجم کل معاملات')).toBeInTheDocument();
    expect(screen.getByText('ارزش کل معاملات')).toBeInTheDocument();
    expect(screen.getByText('نسبت خرید به فروش')).toBeInTheDocument();
    expect(screen.getByText('معاملات موفق')).toBeInTheDocument();
  });

  it('renders weight, turnover and counts with Persian digits', () => {
    render(<TradeHeroCards summary={SUMMARY} />);

    // Weight in grams.
    expect(screen.getByText(/گرم/)).toHaveTextContent('۳۰ گرم');
    // Turnover compact Toman.
    expect(screen.getAllByText(/تومان/).length).toBeGreaterThan(0);
    // Successful transactions count.
    expect(screen.getByText('۳')).toBeInTheDocument();
  });

  it('renders the BUY ratio label and hint counts', () => {
    render(<TradeHeroCards summary={SUMMARY} />);

    expect(screen.getByText('۶۶٫۷٪ خرید')).toBeInTheDocument();
    expect(screen.getByText(/۲ خرید \/ ۱ فروش/)).toBeInTheDocument();
  });

  it('shows skeleton blocks while loading', () => {
    render(<TradeHeroCards summary={undefined} isLoading />);

    expect(screen.getByLabelText('در حال بارگذاری')).toBeInTheDocument();
    expect(screen.queryByText('حجم کل معاملات')).not.toBeInTheDocument();
  });

  it('falls back to em dashes when summary is null', () => {
    render(<TradeHeroCards summary={null} />);

    expect(screen.getByText('حجم کل معاملات')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });
});
