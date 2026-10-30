import React from 'react';
import { render, screen } from '@testing-library/react';
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
  internalKycApi: {
    pendingCount: jest.fn(),
  },
}));

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
