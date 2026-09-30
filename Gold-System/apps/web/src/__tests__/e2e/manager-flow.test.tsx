import React from 'react';
import { render, screen } from '@testing-library/react';
import OverviewPage from '@/app/dashboard/overview/page';
import CustomersPage from '@/app/dashboard/customers/page';
import OrdersPage from '@/app/dashboard/orders/page';
import TradesPage from '@/app/dashboard/trades/page';
import ReportsHomePage from '@/app/dashboard/reports/page';
import { firstStaffRoute } from '@/lib/nav';
import { signIn } from '../dashboard/auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('../dashboard/auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/overview',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  reportsApi: { dashboard: jest.fn() },
  internalCustomersApi: { list: jest.fn() },
  internalOrdersApi: { list: jest.fn() },
  internalTradesApi: { list: jest.fn() },
  tradesFromList: (result: { trades?: unknown[] } | undefined) => result?.trades ?? [],
}));

const api = jest.requireMock('@/lib/internal-api') as {
  reportsApi: { dashboard: jest.Mock };
  internalCustomersApi: { list: jest.Mock };
  internalOrdersApi: { list: jest.Mock };
  internalTradesApi: { list: jest.Mock };
};

const MANAGER = [
  'financial_report.read',
  'customer.read',
  'order.read',
  'trade.read',
  'reports',
  'ledger.read',
];

describe('manager flow', () => {
  beforeEach(() => {
    signIn(MANAGER, ['manager']);
    api.reportsApi.dashboard.mockResolvedValue({
      totalCustomers: 4,
      customersByType: {},
      pendingKyc: 1,
      activeCustomers: 3,
      suspendedCustomers: 0,
      pendingOrders: 0,
      ordersAwaitingReview: 2,
      ordersApproved: 1,
      ordersRejected: 0,
      ordersCancelled: 0,
      ordersTotal: 3,
      confirmedTrades: 1,
      completedTrades: 0,
      reversedTrades: 0,
      totalTradeValueRial: '10.00',
      totalTradeWeightGrams: '1.000000',
      totalPaymentsRecorded: 0,
      totalPaymentsValueRial: '0.00',
      settledTrades: 0,
      unsettledTrades: 1,
      supplierPayableRial: '0.00',
      salesRevenueRial: '10.00',
      purchaseCostRial: '0.00',
      goldPositionGrams: '1.000000',
      goldObligationGrams: '1.000000',
      totalSuppliers: 0,
      activeSuppliers: 0,
      totalPurchasedRial: '0.00',
      pendingPurchases: 0,
      confirmedPurchases: 0,
      recentTrades: [],
      recentPayments: [],
    });
    api.internalCustomersApi.list.mockResolvedValue({
      items: [
        {
          id: 'c1',
          customerNumber: 'C-1',
          fullName: 'مدیر مشتری',
          firstName: 'مدیر',
          lastName: 'مشتری',
          mobile: '09120000000',
          type: 'VIP',
          status: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00.000Z',
          userId: null,
          nationalId: '1',
          email: null,
          dateOfBirth: null,
          address: null,
          rejectionReason: null,
          isTradeEligible: true,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.internalOrdersApi.list.mockResolvedValue({
      orders: [
        {
          id: 'o1',
          orderNumber: 'ORD-1',
          customerId: 'c1',
          status: 'APPROVED',
          totalAmountRial: '10.00',
          reservedAmountRial: '0.00',
          weightGrams: '1.000000',
          purityRatio: '0.750000',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.internalTradesApi.list.mockResolvedValue({
      trades: [
        {
          id: 't1',
          tradeNumber: 'TR-1',
          orderId: 'o1',
          customerId: 'c1',
          status: 'CONFIRMED',
          totalAmountRial: '10.00',
          weightGrams: '1.000000',
          confirmedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('moves from the management home through customer, order, trade and reports', async () => {
    expect(firstStaffRoute(MANAGER)).toBe('/dashboard/overview');
    const { unmount } = render(<OverviewPage />);
    expect(await screen.findByText('نمای مدیریت')).toBeInTheDocument();
    unmount();

    const customers = render(<CustomersPage />);
    expect(await screen.findByText('مدیر مشتری')).toBeInTheDocument();
    customers.unmount();

    const orders = render(<OrdersPage />);
    expect(await screen.findByText('ORD-1')).toBeInTheDocument();
    orders.unmount();

    const trades = render(<TradesPage />);
    expect(await screen.findByText('TR-1')).toBeInTheDocument();
    trades.unmount();

    render(<ReportsHomePage />);
    expect(screen.getByRole('link', { name: 'معاملات' })).toHaveAttribute(
      'href',
      '/dashboard/reports/trades',
    );
  });
});
