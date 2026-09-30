import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatsCard } from '../components/portal/profile/account-stats-card';
import { DeleteAccountCard } from '../components/portal/profile/delete-account-card';
import { PersonalInformationCard } from '../components/portal/profile/personal-information-card';
import { ProfileHero } from '../components/portal/profile/profile-hero';
import { ProfileKycCard } from '../components/portal/profile/profile-kyc-card';
import { readListTotal } from '../components/portal/profile/read-list-total';
import type { CustomerProfile } from '../lib/api';

const customer: CustomerProfile = {
  id: 'c1',
  customerNumber: 'CUST-000001',
  firstName: 'علی',
  lastName: 'رضایی',
  nationalId: '0012345678',
  mobile: '09120000001',
  email: 'ali@example.com',
  address: 'تهران',
  postalCode: '1234567890',
  type: 'HOUSEHOLD',
  status: 'ACTIVE',
  createdAt: '2026-09-26T00:00:00.000Z',
};

describe('readListTotal', () => {
  it('reads meta.total and a top-level total', () => {
    expect(readListTotal({ meta: { total: 12 } })).toBe(12);
    expect(readListTotal({ total: 25 })).toBe(25);
    expect(readListTotal(null)).toBeNull();
  });
});

describe('ProfileHero', () => {
  it('offers a profile photo upload control', () => {
    render(<ProfileHero customer={customer} onUpdated={() => undefined} />);
    expect(screen.getByRole('button', { name: 'تغییر عکس پروفایل' })).toBeInTheDocument();
  });
});

describe('ProfileKycCard', () => {
  it('renders the verified profile copy', () => {
    render(<ProfileKycCard customerStatus="ACTIVE" />);
    expect(screen.getByText('احراز هویت شما تأیید شده است.')).toBeInTheDocument();
    expect(screen.getByText('مشاهده جزئیات').closest('a')).toHaveAttribute('href', '/portal/kyc');
  });
});

describe('AccountStatsCard', () => {
  it('marks gold holdings as demo data and shows live counts', () => {
    render(<AccountStatsCard orders={{ meta: { total: 12 } }} trades={{ total: 25 }} />);
    expect(screen.getByText('نمونه نمایشی')).toBeInTheDocument();
    expect(screen.getByText('۱۲')).toBeInTheDocument();
    expect(screen.getByText('۲۵')).toBeInTheDocument();
  });
});

describe('PersonalInformationCard', () => {
  it('shows profile fields and blocks silent identity edits', async () => {
    const user = userEvent.setup();
    render(<PersonalInformationCard customer={customer} onSaved={() => undefined} />);
    expect(screen.getByText('علی')).toBeInTheDocument();
    expect(screen.queryByText('CUST-000001')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ویرایش' }));
    expect(
      screen.getByText('برای تغییر اطلاعات هویتی، لطفاً با پشتیبانی تماس بگیرید.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('ایمیل')).toBeInTheDocument();
    expect(screen.queryByLabelText('کد ملی')).not.toBeInTheDocument();
  });
});

describe('DeleteAccountCard', () => {
  it('blocks deletion when the customer has orders', async () => {
    const user = userEvent.setup();
    render(<DeleteAccountCard account={null} orderCount={2} tradeCount={0} />);
    await user.click(screen.getByRole('button', { name: 'درخواست حذف حساب' }));
    expect(screen.getByText(/حذف مستقیم حساب امکان‌پذیر نیست/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ثبت درخواست' })).not.toBeInTheDocument();
  });
});
