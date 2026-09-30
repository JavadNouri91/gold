import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DashboardLayout from '@/app/dashboard/layout';
import { authState, signIn, signOut } from './auth-state';

const replace = jest.fn();

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/dashboard/overview',
  useSearchParams: () => new URLSearchParams(),
}));

describe('protected internal routes', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('sends an anonymous visitor to the staff login', async () => {
    signOut();
    authState.isAuthenticated = false;
    render(
      <DashboardLayout>
        <p>محتوای داخلی</p>
      </DashboardLayout>,
    );
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard/login');
    });
    expect(screen.queryByText('محتوای داخلی')).not.toBeInTheDocument();
  });

  it('sends a customer account away from the internal shell', async () => {
    signIn(['customer.order.read_own', 'customer.profile.read']);
    render(
      <DashboardLayout>
        <p>محتوای داخلی</p>
      </DashboardLayout>,
    );
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/portal/dashboard');
    });
  });

  it('keeps a staff user inside a right-aligned shell', () => {
    signIn(['financial_report.read']);
    render(
      <DashboardLayout>
        <p>نمای داخلی</p>
      </DashboardLayout>,
    );
    expect(screen.getByText('نمای داخلی')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'منوی داخلی' }).closest('aside')?.className).toContain(
      'right-0',
    );
  });
});
