import React from 'react';
import { render, screen } from '@testing-library/react';
import CustomersPage from '@/app/dashboard/customers/page';
import OrdersPage from '@/app/dashboard/orders/page';
import { visibleNav } from '@/lib/nav';
import { signIn } from '../dashboard/auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('../dashboard/auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/customers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: { list: jest.fn() },
  internalOrdersApi: { list: jest.fn(), quotations: jest.fn(), getById: jest.fn(), approve: jest.fn() },
  internalTradesApi: { confirm: jest.fn() },
  assignmentsApi: { list: jest.fn() },
  internalQuotationsApi: { download: jest.fn(), getById: jest.fn() },
}));

const api = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: { list: jest.Mock };
  internalOrdersApi: { list: jest.Mock; quotations: jest.Mock };
};

describe('operator flow', () => {
  it('opens customers and orders without ledger access', async () => {
    const permissions = ['customer.read', 'order.read', 'quotation.read', 'order.assign'];
    signIn(permissions, ['operator']);
    const hrefs = visibleNav(permissions).map((item) => item.href);
    expect(hrefs).toEqual(
      expect.arrayContaining(['/dashboard/customers', '/dashboard/orders']),
    );
    expect(hrefs).not.toContain('/dashboard/quotations');
    expect(hrefs).not.toContain('/dashboard/ledger/financial');

    api.internalCustomersApi.list.mockResolvedValue({
      items: [
        {
          id: 'c1',
          customerNumber: 'C-OP',
          fullName: 'مشتری اپراتور',
          firstName: 'مشتری',
          lastName: 'اپراتور',
          mobile: '09123333333',
          type: 'PARTNER',
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
    const customers = render(<CustomersPage />);
    expect(await screen.findByText('مشتری اپراتور')).toBeInTheDocument();
    customers.unmount();

    api.internalOrdersApi.list.mockResolvedValue({
      orders: [
        {
          id: 'o1',
          orderNumber: 'ORD-OP',
          customerId: 'c1',
          status: 'QUOTED',
          totalAmountRial: '5.00',
          reservedAmountRial: '0.00',
          weightGrams: '1.000000',
          purityRatio: '0.750000',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    api.internalOrdersApi.quotations.mockResolvedValue([]);
    const orders = render(<OrdersPage />);
    expect((await screen.findAllByText('ORD-OP')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'نمایش' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'چاپ' })).toBeInTheDocument();
    orders.unmount();
  });
});
