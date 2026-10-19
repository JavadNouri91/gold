import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('shows the management dashboard with KPI cards, search, and dynamic actions', async () => {
    signIn(['customer.read', 'kyc.review']);
    internalKycApi.queue.mockResolvedValue({
      items: [
        {
          id: 'customer-1',
          customerNumber: 'C-1018',
          fullName: 'رضا نوری',
          mobile: '09120001005',
          nationalId: '0012345678',
          status: 'ACTIVE',
          customerType: 'HOUSEHOLD',
          bucket: 'awaiting',
          kycDisplay: 'awaiting',
          verificationStatus: 'PENDING',
          pendingDocuments: 2,
          viewedDocuments: 1,
          latestSubmittedAt: '2026-10-13T15:02:20.000Z',
        },
        {
          id: 'customer-2',
          customerNumber: 'C-1001',
          fullName: 'سارا موسوی',
          mobile: '09120001008',
          nationalId: '0012345679',
          status: 'SUSPENDED',
          customerType: 'PARTNER',
          bucket: 'unverified',
          kycDisplay: 'rejected',
          verificationStatus: 'REJECTED',
          pendingDocuments: 0,
          viewedDocuments: 0,
          latestSubmittedAt: '2026-10-12T10:00:00.000Z',
        },
      ],
      summary: { verified: 15, unverified: 48, awaiting: 3 },
      meta: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    render(<KycQueuePage />);

    expect(
      await screen.findByText('مدیریت احراز هویت مشتریان (KYC)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('بررسی و تایید مدارک هویتی و بانکی کاربران سامانه'),
    ).toBeInTheDocument();

    expect(screen.getByText('احراز هویت‌شده (فعال)')).toBeInTheDocument();
    expect(screen.getAllByText('احراز هویت‌نشده (ناقص)').length).toBeGreaterThan(0);
    expect(screen.getByText('در انتظار تایید مدارک (صف)')).toBeInTheDocument();
    expect(screen.getByText('۱۵ حساب')).toBeInTheDocument();
    expect(screen.getByText('۴۸ حساب')).toBeInTheDocument();
    expect(screen.getByText('۳ پرونده')).toBeInTheDocument();

    expect(
      screen.getByPlaceholderText('جستجو (نام، موبایل، کدملی)'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /خروجی اکسل/ })).toBeInTheDocument();

    expect(await screen.findByText('رضا نوری')).toBeInTheDocument();
    expect(screen.getByText('۰۹۱۲۰۰۰۱۰۰۵')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();
    expect(screen.getAllByText('در انتظار تایید (صف)').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('link', { name: /بررسی مدارک/ }),
    ).toHaveAttribute('href', '/dashboard/kyc/customer-1');

    expect(screen.getByText('سارا موسوی')).toBeInTheDocument();
    expect(screen.getByText('تعلیق')).toBeInTheDocument();
    expect(screen.getByText('رد شده (مغایرت)')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /مشاهده پرونده/ }),
    ).toHaveAttribute('href', '/dashboard/kyc/customer-2');

    await waitFor(() =>
      expect(internalKycApi.queue).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, limit: 20 }),
      ),
    );
  });

  it('filters by awaiting KPI card when clicked', async () => {
    const user = userEvent.setup();
    signIn(['customer.read', 'kyc.review']);
    internalKycApi.queue.mockResolvedValue({
      items: [],
      summary: { verified: 1, unverified: 2, awaiting: 3 },
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    });

    render(<KycQueuePage />);
    await screen.findByText('۳ پرونده');

    await user.click(screen.getByText('در انتظار تایید مدارک (صف)'));

    await waitFor(() =>
      expect(internalKycApi.queue).toHaveBeenCalledWith(
        expect.objectContaining({ bucket: 'awaiting' }),
      ),
    );
  });
});
