import React from 'react';
import { render, screen } from '@testing-library/react';
import { redirect } from 'next/navigation';
import { kycSummaryBadge } from '@/components/portal/settings/kyc-summary';
import { ProfilePreferences } from '@/components/portal/profile/profile-preferences';
import { ThemeProvider } from '@/components/theme-provider';
import SettingsPage from '@/app/portal/settings/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

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

describe('ProfilePreferences', () => {
  it('keeps the unique settings on the profile page', () => {
    render(
      <ThemeProvider>
        <ProfilePreferences />
      </ThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: 'تنظیمات' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /اعلان‌ها/ })).toHaveAttribute('href', '/portal/notifications');
    expect(screen.getByText('گرم')).toBeInTheDocument();
    expect(screen.getByText('تومان')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'روشن' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'تاریک' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'خودکار' })).toBeInTheDocument();
    expect(screen.getByText('فارسی')).toBeInTheDocument();

    expect(screen.queryByRole('link', { name: /اطلاعات شخصی/ })).not.toBeInTheDocument();
    expect(screen.queryByText('اعلان‌های دستگاه')).not.toBeInTheDocument();
    expect(screen.queryByText('ورودهای اخیر')).not.toBeInTheDocument();
    expect(screen.queryByText('هشدار قیمت')).not.toBeInTheDocument();
    expect(screen.queryByText('تأیید قبل از ثبت سفارش')).not.toBeInTheDocument();
    expect(screen.queryByText('تیره')).not.toBeInTheDocument();
    expect(screen.getByText('حالت روشن سامانه')).toBeInTheDocument();
  });
});

describe('SettingsPage', () => {
  it('sends the old settings route to the profile settings section', () => {
    expect(() => SettingsPage()).toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/portal/profile#settings');
  });
});
