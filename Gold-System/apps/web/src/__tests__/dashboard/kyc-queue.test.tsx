import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import KycQueuePage from '@/app/dashboard/kyc/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalKycApi: {
    queue: jest.fn(),
  },
}));

const { internalKycApi } = jest.requireMock('@/lib/internal-api') as {
  internalKycApi: { queue: jest.Mock };
};

describe('KYC review queue', () => {
  it('shows active customers with pending documents and a quick review action', async () => {
    signIn(['customer.read', 'kyc.review']);
    internalKycApi.queue.mockResolvedValue({
      items: [
        {
          id: 'customer-1',
          customerNumber: 'CUST-1001',
          fullName: 'علی رضایی',
          mobile: '09120001001',
          status: 'ACTIVE',
          pendingDocuments: 3,
          viewedDocuments: 1,
          latestSubmittedAt: '2026-10-13T15:02:20.000Z',
        },
      ],
      summary: { verified: 2, unverified: 5, awaiting: 1 },
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    render(<KycQueuePage />);

    expect(await screen.findByText('احراز هویت‌شده')).toBeInTheDocument();
    expect(screen.getByText('احراز هویت‌نشده')).toBeInTheDocument();
    expect(screen.getByText('در انتظار تأیید مدارک')).toBeInTheDocument();
    expect(screen.getByText('۲')).toBeInTheDocument();
    expect(screen.getByText('۵')).toBeInTheDocument();
    expect(await screen.findByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('۰۹۱۲۰۰۰۱۰۰۱')).toBeInTheDocument();
    expect(screen.getByText('۳ منتظر مشاهده')).toBeInTheDocument();
    expect(screen.getByText('۱ منتظر تصمیم')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /بررسی و تأیید مدارک/ }),
    ).toHaveAttribute('href', '/dashboard/kyc/customer-1');
    await waitFor(() => expect(internalKycApi.queue).toHaveBeenCalled());
  });
});
