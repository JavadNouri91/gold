import { render, screen, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import CustomersReportPage from '@/app/dashboard/reports/customers/page';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  reportsApi: { customers: jest.fn() },
}));

const { reportsApi } = jest.requireMock('@/lib/internal-api') as {
  reportsApi: { customers: jest.Mock };
};

describe('customer report status badges', () => {
  it('renders Persian labels and semantic colors, including empty and unknown values', async () => {
    signIn(['reports']);
    reportsApi.customers.mockResolvedValue({
      total: 4,
      byType: {},
      byStatus: {},
      pendingKyc: 0,
      customers: [
        { id: '1', customerNumber: '1', firstName: 'الف', lastName: 'الف', mobile: '', type: null, status: 'ACTIVE', kycStatus: 'APPROVED', creditLimitRial: null, consumedCreditRial: null, reservedCreditRial: null, availableCreditRial: null, createdAt: '' },
        { id: '2', customerNumber: '2', firstName: 'ب', lastName: 'ب', mobile: '', type: null, status: 'UNDER_REVIEW', kycStatus: 'PENDING', creditLimitRial: null, consumedCreditRial: null, reservedCreditRial: null, availableCreditRial: null, createdAt: '' },
        { id: '3', customerNumber: '3', firstName: 'ج', lastName: 'ج', mobile: '', type: null, status: 'BLOCKED', kycStatus: 'REJECTED', creditLimitRial: null, consumedCreditRial: null, reservedCreditRial: null, availableCreditRial: null, createdAt: '' },
        { id: '4', customerNumber: '4', firstName: 'د', lastName: 'د', mobile: '', type: null, status: 'UNKNOWN', kycStatus: null, creditLimitRial: null, consumedCreditRial: null, reservedCreditRial: null, availableCreditRial: null, createdAt: '' },
      ],
    });

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <CustomersReportPage />
      </SWRConfig>,
    );

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('فعال')).toHaveClass('bg-green-100', 'text-green-800');
    expect(within(rows[0]!).getByText('تأیید شده')).toHaveClass('bg-green-100', 'text-green-800');
    expect(within(rows[1]!).getByText('در حال بررسی')).toHaveClass('bg-yellow-100', 'text-yellow-800');
    expect(within(rows[1]!).getByText('در انتظار بررسی')).toHaveClass('bg-yellow-100', 'text-yellow-800');
    expect(within(rows[2]!).getByText('مسدود')).toHaveClass('bg-red-100', 'text-red-800');
    expect(within(rows[2]!).getByText('رد شده')).toHaveClass('bg-red-100', 'text-red-800');
    expect(within(rows[3]!).getByText('نامشخص')).toHaveClass('bg-gray-100', 'text-gray-800');
    expect(within(rows[3]!).getAllByRole('cell')[4]).toHaveTextContent('—');
  });
});
