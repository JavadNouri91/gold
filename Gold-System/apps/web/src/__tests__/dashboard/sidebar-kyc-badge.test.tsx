import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/overview',
}));

jest.mock('@/lib/internal-api', () => ({
  internalPaymentsApi: { staffSummary: jest.fn() },
  staffPickupsApi: { list: jest.fn() },
  internalOrdersApi: { summary: jest.fn() },
  internalKycApi: {
    pendingCount: jest.fn(),
  },
}));

const { internalPaymentsApi } = jest.requireMock('@/lib/internal-api') as {
  internalPaymentsApi: { staffSummary: jest.Mock };
};

const { staffPickupsApi } = jest.requireMock('@/lib/internal-api') as {
  staffPickupsApi: { list: jest.Mock };
};

const { internalOrdersApi } = jest.requireMock('@/lib/internal-api') as {
  internalOrdersApi: { summary: jest.Mock };
};

const { internalKycApi } = jest.requireMock('@/lib/internal-api') as {
  internalKycApi: { pendingCount: jest.Mock };
};

function renderSidebar() {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <DashboardSidebar open onClose={() => undefined} />
    </SWRConfig>,
  );
}

describe('Dashboard sidebar KYC badge', () => {
  beforeEach(() => {
    internalKycApi.pendingCount.mockReset();
    internalOrdersApi.summary.mockReset();
  });

  it('shows the awaiting-review count next to the KYC nav item', async () => {
    signIn(['customer.read', 'kyc.review']);
    internalKycApi.pendingCount.mockResolvedValue({ awaiting: 3 });

    renderSidebar();

    expect(
      await screen.findByLabelText('۳ پرونده در انتظار بررسی'),
    ).toBeInTheDocument();
    expect(internalKycApi.pendingCount).toHaveBeenCalledTimes(1);
  });

  it('hides the badge when nothing is awaiting review', async () => {
    signIn(['customer.read', 'kyc.review']);
    internalKycApi.pendingCount.mockResolvedValue({ awaiting: 0 });

    renderSidebar();

    await screen.findByText('احراز هویت');
    expect(
      screen.queryByLabelText('۰ پرونده در انتظار بررسی'),
    ).not.toBeInTheDocument();
  });

  it('does not request the count without review permissions', () => {
    signIn(['kyc.documents.read']);

    renderSidebar();

    expect(internalKycApi.pendingCount).not.toHaveBeenCalled();
  });
});

describe('Dashboard sidebar payment badges', () => {
  beforeEach(() => {
    internalPaymentsApi.staffSummary.mockReset();
  });

  it('shows pending counts rather than totals, with separate colors and Persian digits', async () => {
    signIn(['payment.read']);
    internalPaymentsApi.staffSummary.mockResolvedValue({
      deposits: { pendingCount: 1234, totalCount: 5000 },
      withdrawals: { pendingCount: 2, totalCount: 100 },
    });
    renderSidebar();
    const deposit = await screen.findByLabelText('۱٬۲۳۴ واریز در انتظار تأیید');
    const withdrawal = screen.getByLabelText('۲ برداشت در انتظار تأیید');
    expect(deposit).toHaveClass('bg-emerald-600');
    expect(withdrawal).toHaveClass('bg-rose-600');
    expect(deposit).toHaveTextContent('۱٬۲۳۴');
    expect(deposit).toHaveAttribute('title', '۱٬۲۳۴ واریز در انتظار تأیید');
    expect(withdrawal).toHaveAttribute('title', '۲ برداشت در انتظار تأیید');
    expect(deposit.closest('a')).toHaveAttribute('href', '/dashboard/payments');
    expect(withdrawal.closest('a')).toBe(deposit.closest('a'));
  });

  it.each([[0, 3], [4, 0], [0, 0]])(
    'hides zero badges (deposits %i, withdrawals %i)',
    async (deposits, withdrawals) => {
      signIn(['payment.read']);
      internalPaymentsApi.staffSummary.mockResolvedValue({
        deposits: { pendingCount: deposits, totalCount: 99 },
        withdrawals: { pendingCount: withdrawals, totalCount: 99 },
      });
      renderSidebar();
      await waitFor(() => expect(internalPaymentsApi.staffSummary).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(screen.queryAllByLabelText(/واریز در انتظار تأیید/)).toHaveLength(deposits > 0 ? 1 : 0);
        expect(screen.queryAllByLabelText(/برداشت در انتظار تأیید/)).toHaveLength(withdrawals > 0 ? 1 : 0);
      });
    },
  );

  it('hides badges until the summary is available', () => {
    signIn(['payment.read']);
    internalPaymentsApi.staffSummary.mockReturnValue(new Promise(() => {}));
    renderSidebar();
    expect(screen.queryByLabelText(/واریز در انتظار تأیید/)).toBeNull();
    expect(screen.queryByLabelText(/برداشت در انتظار تأیید/)).toBeNull();
  });

  it('does not fetch without payment.read', () => {
    signIn(['payment.create']);
    renderSidebar();
    expect(internalPaymentsApi.staffSummary).not.toHaveBeenCalled();
  });
});

describe('Dashboard sidebar pickup badge', () => {
  beforeEach(() => {
    staffPickupsApi.list.mockReset();
  });

  it('shows the total requested pickups, independently of page size', async () => {
    signIn(['pickup.read']);
    staffPickupsApi.list.mockResolvedValue({
      data: [{ id: 'pickup-1' }],
      meta: { total: 1234, limit: 1, offset: 0 },
    });
    renderSidebar();

    const badge = await screen.findByLabelText('۱٬۲۳۴ درخواست تحویل حضوری در انتظار بررسی');
    expect(badge).toHaveTextContent('۱٬۲۳۴');
    expect(badge).toHaveClass('bg-amber-600');
    expect(badge.closest('a')).toHaveAttribute('href', '/dashboard/pickups');
    expect(staffPickupsApi.list).toHaveBeenCalledWith({
      status: 'REQUESTED', limit: 1, offset: 0,
    });
  });

  it('hides the badge when there are no requested pickups', async () => {
    signIn(['pickup.read']);
    staffPickupsApi.list.mockResolvedValue({
      data: [], meta: { total: 0, limit: 1, offset: 0 },
    });
    renderSidebar();
    await waitFor(() => expect(staffPickupsApi.list).toHaveBeenCalledTimes(1));
    expect(screen.queryByLabelText(/درخواست تحویل حضوری در انتظار بررسی/)).toBeNull();
  });

  it('hides the badge while the count is unavailable', () => {
    signIn(['pickup.read']);
    staffPickupsApi.list.mockReturnValue(new Promise(() => {}));
    renderSidebar();
    expect(screen.queryByLabelText(/درخواست تحویل حضوری در انتظار بررسی/)).toBeNull();
  });

  it('does not fetch without pickup.read even if the pickup menu is visible', () => {
    signIn(['pickup.prepare']);
    renderSidebar();
    expect(staffPickupsApi.list).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/درخواست تحویل حضوری در انتظار بررسی/)).toBeNull();
  });
});

describe('Dashboard sidebar order badges', () => {
  beforeEach(() => {
    internalOrdersApi.summary.mockReset();
  });

  it('shows distinct buy and sell badges with Persian digits', async () => {
    signIn(['order.read']);
    internalOrdersApi.summary.mockResolvedValue({
      pendingBuyOrdersCount: 1234,
      pendingSellOrdersCount: 2,
    });
    renderSidebar();

    const buy = await screen.findByLabelText('۱٬۲۳۴ سفارش خرید در انتظار بررسی');
    const sell = screen.getByLabelText('۲ سفارش فروش در انتظار بررسی');
    expect(buy).toHaveClass('bg-emerald-600');
    expect(sell).toHaveClass('bg-rose-600');
    expect(buy.closest('a')).toHaveAttribute('href', '/dashboard/orders');
    expect(sell.closest('a')).toBe(buy.closest('a'));
  });

  it.each([[0, 3], [4, 0], [0, 0]])(
    'hides zero badges (buy %i, sell %i)',
    async (pendingBuyOrdersCount, pendingSellOrdersCount) => {
      signIn(['order.read']);
      internalOrdersApi.summary.mockResolvedValue({ pendingBuyOrdersCount, pendingSellOrdersCount });
      renderSidebar();
      await waitFor(() => expect(internalOrdersApi.summary).toHaveBeenCalledTimes(1));
      await waitFor(() => {
        expect(screen.queryByLabelText(/سفارش خرید در انتظار بررسی/))[
          pendingBuyOrdersCount > 0 ? 'toBeInTheDocument' : 'toBeNull'
        ]();
        expect(screen.queryByLabelText(/سفارش فروش در انتظار بررسی/))[
          pendingSellOrdersCount > 0 ? 'toBeInTheDocument' : 'toBeNull'
        ]();
      });
    },
  );

  it('does not fetch order counts without order.read', () => {
    signIn(['kyc.documents.read']);
    renderSidebar();
    expect(internalOrdersApi.summary).not.toHaveBeenCalled();
  });
});
