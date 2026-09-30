import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiClientError, authApi, type CustomerProfile, type KycPhase } from '@/lib/api';
import { kycSummaryBadge } from '@/components/portal/settings/kyc-summary';
import SettingsPage from '@/app/portal/settings/page';

type SwrBag = Record<
  string,
  { data?: unknown; error?: unknown; isLoading?: boolean; mutate?: () => void }
>;

jest.mock('swr', () => {
  const actual = jest.requireActual<typeof import('swr')>('swr');
  return {
    __esModule: true,
    ...actual,
    default: (key: string | null) => {
      const slot =
        (globalThis as { __settingsSwr?: SwrBag }).__settingsSwr?.[key ?? ''] ?? undefined;
      if (!key || !slot) {
        return { data: undefined, error: undefined, isLoading: false, mutate: jest.fn() };
      }
      return {
        data: slot.data,
        error: slot.error,
        isLoading: Boolean(slot.isLoading),
        mutate: slot.mutate ?? jest.fn(),
      };
    },
  };
});

jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ logout: jest.fn() }),
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      revokeOtherSessions: jest.fn(),
      revokeSession: jest.fn(),
      sessions: jest.fn(),
    },
  };
});

const customer: CustomerProfile = {
  id: 'c1',
  customerNumber: 'CUS-000125',
  firstName: 'علی',
  lastName: 'رضایی',
  mobile: '09120000001',
  type: 'HOUSEHOLD',
  status: 'ACTIVE',
  createdAt: '2026-09-26T00:00:00.000Z',
  nationalId: '0012345678',
};

function setSwr(next: SwrBag) {
  (globalThis as { __settingsSwr?: SwrBag }).__settingsSwr = next;
}

function loaded(phase: KycPhase = 'VERIFIED') {
  setSwr({
    'customer/me': { data: customer },
    'customer/me/kyc': { data: { phase } },
  });
}

describe('kycSummaryBadge', () => {
  it('uses the existing KYC phases', () => {
    expect(kycSummaryBadge('VERIFIED').label).toBe('تأیید شده');
    expect(kycSummaryBadge('SUBMITTED').label).toBe('در انتظار بررسی');
    expect(kycSummaryBadge('UNDER_REVIEW').label).toBe('در حال بررسی');
    expect(kycSummaryBadge('NEEDS_CORRECTION').label).toBe('نیازمند اصلاح');
    expect(kycSummaryBadge('REJECTED').label).toBe('رد شده');
    expect(kycSummaryBadge('NOT_STARTED').label).toBe('تکمیل نشده');
    expect(kycSummaryBadge('IN_PROGRESS').label).toBe('تکمیل نشده');
  });
});

describe('SettingsPage', () => {
  beforeEach(() => {
    loaded();
    jest.mocked(authApi.revokeOtherSessions).mockReset();
  });

  it('shows the account summary and only real destinations', () => {
    render(<SettingsPage />);

    expect(screen.getByRole('heading', { name: 'تنظیمات' })).toBeInTheDocument();
    expect(screen.getByText('علی رضایی')).toBeInTheDocument();
    expect(screen.getByText('۰۹۱۲•••••۰۱')).toBeInTheDocument();
    expect(screen.getByText('CUS-000125')).toBeInTheDocument();
    expect(screen.getByText('مشتری خانگی')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();
    expect(screen.getByText('تأیید شده')).toBeInTheDocument();
    expect(screen.queryByText('0012345678')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: /اطلاعات شخصی/ })).toHaveAttribute('href', '/portal/profile');
    expect(screen.getByRole('link', { name: /احراز هویت/ })).toHaveAttribute('href', '/portal/kyc');
    expect(screen.getByRole('link', { name: /رمز عبور/ })).toHaveAttribute('href', '/portal/profile#security');
    expect(screen.getByRole('link', { name: /اعلان‌ها/ })).toHaveAttribute('href', '/portal/notifications');
    expect(screen.getByRole('link', { name: /امنیت حساب/ })).toHaveAttribute('href', '/portal/profile#security');

    expect(screen.getByText('گرم')).toBeInTheDocument();
    expect(screen.getByText('ریال')).toBeInTheDocument();
    expect(screen.getByText('روشن')).toBeInTheDocument();
    expect(screen.getByText('فارسی')).toBeInTheDocument();

    expect(screen.queryByText('اعلان‌های دستگاه')).not.toBeInTheDocument();
    expect(screen.queryByText('ورودهای اخیر')).not.toBeInTheDocument();
    expect(screen.queryByText('هشدار قیمت')).not.toBeInTheDocument();
    expect(screen.queryByText('تأیید قبل از ثبت سفارش')).not.toBeInTheDocument();
    expect(screen.queryByText('تیره')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی حساب' })).not.toBeInTheDocument();
  });

  it('keeps navigation while the account summary is loading', () => {
    setSwr({ 'customer/me': { isLoading: true } });
    render(<SettingsPage />);
    expect(screen.getByLabelText('در حال بارگذاری حساب')).toBeInTheDocument();
    expect(screen.queryByText('علی رضایی')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /اطلاعات شخصی/ })).toBeInTheDocument();
  });

  it('offers a retry when the account cannot be loaded and hides the server message', () => {
    const mutate = jest.fn();
    setSwr({ 'customer/me': { error: new Error('database exploded'), mutate } });
    render(<SettingsPage />);
    expect(screen.getByText('تنظیمات قابل دریافت نیست.')).toBeInTheDocument();
    expect(screen.queryByText('database exploded')).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'تلاش مجدد' }).click();
    expect(mutate).toHaveBeenCalled();
  });

  it('explains a missing customer profile', () => {
    setSwr({
      'customer/me': { error: new ApiClientError('NOT_FOUND', 'missing', 404) },
    });
    render(<SettingsPage />);
    expect(screen.getByText('پروفایل مشتری برای این حساب کاربری ثبت نشده است.')).toBeInTheDocument();
    expect(screen.queryByText('missing')).not.toBeInTheDocument();
  });

  it('opens active sessions from real session data', async () => {
    const user = userEvent.setup();
    setSwr({
      'customer/me': { data: customer },
      'customer/me/kyc': { data: { phase: 'VERIFIED' } },
      'auth/sessions': {
        data: [
          {
            id: 's1',
            createdAt: '2026-09-30T10:00:00.000Z',
            expiresAt: '2026-10-01T10:00:00.000Z',
            ipAddress: '1.1.1.1',
            device: 'iPhone',
            browser: 'Safari',
            os: 'iOS',
            current: true,
          },
        ],
      },
    });
    render(<SettingsPage />);
    await user.click(screen.getByRole('button', { name: /دستگاه‌های فعال/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/آیفون/)).toBeInTheDocument();
  });

  it('confirms signing out other devices and shows a fixed error', async () => {
    const user = userEvent.setup();
    jest.mocked(authApi.revokeOtherSessions).mockRejectedValue(new Error('token table locked'));
    render(<SettingsPage />);
    await user.click(screen.getByRole('button', { name: /خروج از سایر دستگاه‌ها/ }));
    expect(screen.getByText(/همه نشست‌های دیگر پایان می‌یابند/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'پایان سایر نشست‌ها' }));
    expect(await screen.findByText('پایان نشست‌ها انجام نشد. لطفاً دوباره تلاش کنید.')).toBeInTheDocument();
    expect(screen.queryByText('token table locked')).not.toBeInTheDocument();
  });
});
