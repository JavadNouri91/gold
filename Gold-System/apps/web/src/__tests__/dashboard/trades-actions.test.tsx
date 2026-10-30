import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TradesPage from '@/app/dashboard/trades/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/trades',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  internalTradesApi: {
    list: jest.fn(),
    getById: jest.fn(),
    summary: jest.fn(),
  },
  tradesFromList: (result: { trades?: unknown[] } | undefined) => result?.trades ?? [],
}));

const api = jest.requireMock('@/lib/internal-api') as {
  internalTradesApi: { list: jest.Mock; getById: jest.Mock; summary: jest.Mock };
};

const TRADE = {
  id: 't1',
  tradeNumber: 'TR-1',
  orderId: 'o1',
  orderNumber: 'ORD-1',
  customerId: 'c1',
  customerName: 'مشتری نمونه',
  status: 'CONFIRMED',
  totalAmountRial: '10.00',
  weightGrams: '1.000000',
  purityRatio: '0.750000',
  unitPriceRial: '5.00',
  feeAmountRial: '1.00',
  confirmedAt: '2026-01-02T00:00:00.000Z',
};

describe('trades list actions', () => {
  beforeEach(() => {
    signIn(['trade.read']);
    api.internalTradesApi.list.mockResolvedValue({ trades: [TRADE], total: 1 });
    api.internalTradesApi.getById.mockResolvedValue(TRADE);
    api.internalTradesApi.summary.mockResolvedValue({
      totalTrades: 1,
      confirmedTrades: 1,
      reversedTrades: 0,
      totalWeightGrams: '1.000000',
      totalTurnoverRial: '10.00',
      buy: { count: 1, weightGrams: '1.000000', turnoverRial: '10.00' },
      sell: { count: 0, weightGrams: '0.000000', turnoverRial: '0.00' },
      buyRatioPercent: 100,
    });
    window.print = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders separate view and print buttons in the actions column', async () => {
    render(<TradesPage />);
    expect(await screen.findByRole('button', { name: 'مشاهده معامله TR-1' })).toHaveTextContent(
      'نمایش',
    );
    expect(screen.getByRole('button', { name: 'چاپ معامله TR-1' })).toHaveTextContent('چاپ');
  });

  it('opens the dialog without printing when view is clicked', async () => {
    const user = userEvent.setup();
    render(<TradesPage />);
    await user.click(await screen.findByRole('button', { name: 'مشاهده معامله TR-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(api.internalTradesApi.getById).toHaveBeenCalledWith('t1'));
    expect(window.print).not.toHaveBeenCalled();
  });

  it('opens the dialog and triggers printing when print is clicked', async () => {
    const user = userEvent.setup();
    render(<TradesPage />);
    await user.click(await screen.findByRole('button', { name: 'چاپ معامله TR-1' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(window.print).toHaveBeenCalled());
  });
});
