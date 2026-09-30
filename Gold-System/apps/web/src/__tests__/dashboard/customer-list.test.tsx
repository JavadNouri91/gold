import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CustomersPage from '@/app/dashboard/customers/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/dashboard/customers',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: {
    list: jest.fn(),
  },
}));

const { internalCustomersApi } = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: { list: jest.Mock };
};

describe('customer list', () => {
  it('renders customers returned by the API', async () => {
    signIn(['customer.read']);
    internalCustomersApi.list.mockResolvedValue({
      items: [
        {
          id: 'c1',
          customerNumber: 'C-100',
          userId: null,
          firstName: 'علی',
          lastName: 'رضایی',
          fullName: 'علی رضایی',
          nationalId: '001',
          mobile: '09121111111',
          email: null,
          dateOfBirth: null,
          address: null,
          type: 'HOUSEHOLD',
          status: 'ACTIVE',
          rejectionReason: null,
          isTradeEligible: true,
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    render(<CustomersPage />);
    expect(await screen.findByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('C-100')).toBeInTheDocument();
    await waitFor(() => {
      expect(internalCustomersApi.list).toHaveBeenCalled();
    });
  });

  it('blocks the list without customer.read', () => {
    signIn(['order.read']);
    render(<CustomersPage />);
    expect(screen.getByText(/customer.read/)).toBeInTheDocument();
  });
});
