import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
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
  it.each([18, 20])('keeps row numbers and summary totals correct across pages of %i', async (initialLimit) => {
    signIn(['customer.read', 'kyc.review']);
    const user = userEvent.setup();
    internalKycApi.queue.mockImplementation(async ({ page, limit }) => {
      const size = limit === 10 ? 10 : initialLimit;
      return {
        items: Array.from({ length: size }, (_, index) => ({
          id: `customer-${size - index}`,
          customerNumber: `C-${size - index}`,
          fullName: `مشتری ${size - index}`,
          mobile: '09120001005',
          status: 'ACTIVE',
          bucket: 'awaiting',
          kycDisplay: 'awaiting',
          latestSubmittedAt: '2026-10-13T15:02:20.000Z',
        })),
        summary: { verified: 15, unverified: 48, awaiting: 37 },
        meta: { page, limit: size, total: 100, totalPages: Math.ceil(100 / size) },
      };
    });
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <KycQueuePage />
      </SWRConfig>,
    );
    const checkRows = async (offset: number, size: number) => {
      await waitFor(() => {
        const table = screen.getByRole('table');
        const headers = within(table).getAllByRole('columnheader');
        expect(headers[0]).toHaveTextContent('ردیف');
        expect(headers[0]).toHaveClass('w-12', 'text-center');
        expect(headers[1]).toHaveTextContent('شناسه');
        const rows = within(table).getAllByRole('row').slice(1);
        expect(rows).toHaveLength(size);
        rows.forEach((row, index) => {
          const cells = within(row).getAllByRole('cell');
          expect(cells[0].textContent).toBe(String(offset + index + 1).replace(/\d/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]));
          expect(cells[0]).toHaveClass('w-12', 'text-center');
          expect(cells[1]).toHaveTextContent('C-');
        });
        expect(screen.getByText('۱۵ حساب')).toBeInTheDocument();
        expect(screen.getByText('۴۸ حساب')).toBeInTheDocument();
        expect(screen.getByText('۳۷ پرونده')).toBeInTheDocument();
      });
    };
    await checkRows(0, initialLimit);
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    await checkRows(initialLimit, initialLimit);
    await user.selectOptions(screen.getByRole('combobox', { name: 'تعداد در صفحه' }), '10');
    await checkRows(0, 10);
    expect(internalKycApi.queue).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
    await user.click(screen.getByText('در انتظار تایید مدارک (صف)'));
    await checkRows(0, 10);
  });

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
    expect(screen.queryByText('فعال')).not.toBeInTheDocument();
    expect(screen.getByText('غیرفعال')).toBeInTheDocument();
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
