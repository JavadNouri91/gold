import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatsCard } from '../components/portal/profile/account-stats-card';
import { BankAccountsCard } from '../components/portal/profile/bank-accounts-card';
import { PersonalInformationCard } from '../components/portal/profile/personal-information-card';
import { ProfileHero } from '../components/portal/profile/profile-hero';
import { ProfileKycCard } from '../components/portal/profile/profile-kyc-card';
import { ProfileKycPanel } from '../components/portal/profile/profile-kyc-panel';
import { ProfileTabs } from '../components/portal/profile/profile-tabs';
import { readListTotal } from '../components/portal/profile/read-list-total';
import { formatIbanDisplay, ibanBankLogoName, ibanBankName } from '../lib/iban-bank';
import type { CustomerProfile, OwnKycOverview } from '../lib/api';

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

const bankAccountStore: { accounts: Array<{
  id: string;
  iban: string;
  bankCode: string | null;
  bankName: string | null;
  accountHolder: string;
  status: string;
  createdAt: string;
}> } = { accounts: [] };

jest.mock('react-iranian-bank-logo', () => ({
  IranianBank: ({ alt }: { alt?: string }) => <img alt={alt ?? ''} />,
}));

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    kycApi: {
      ...actual.kycApi,
      getOwnDocumentFile: jest.fn(() => new Promise(() => undefined)),
    },
    customerApi: {
      ...actual.customerApi,
      listMyBankAccounts: jest.fn(() => Promise.resolve([...bankAccountStore.accounts])),
      createMyBankAccount: jest.fn(async (iban: string) => {
        const normalized = iban.replace(/\s/g, '').toUpperCase();
        const created = {
          id: `ba-${normalized}`,
          iban: normalized,
          bankCode: normalized.slice(4, 7),
          bankName: 'بانک سامان',
          accountHolder: 'علی رضایی',
          status: 'VERIFIED',
          createdAt: '2026-10-20T00:00:00.000Z',
        };
        bankAccountStore.accounts = [created, ...bankAccountStore.accounts];
        return created;
      }),
      deleteMyBankAccount: jest.fn(async (id: string) => {
        bankAccountStore.accounts = bankAccountStore.accounts.filter((item) => item.id !== id);
      }),
    },
  };
});

function verifiedOverview(): OwnKycOverview {
  return {
    phase: 'VERIFIED',
    identityComplete: true,
    customerStatus: 'ACTIVE',
    rejectionReason: null,
    submittedAt: '2026-09-27T11:02:00.000Z',
    upload: { maxBytes: 10 * 1024 * 1024, mimeTypes: ['image/jpeg'] },
    documents: [
      {
        type: 'personal_photo',
        label: 'عکس پرسنلی',
        required: true,
        canUpload: false,
        canDelete: false,
        displayStatus: 'APPROVED',
        file: {
          id: 'f1',
          fileName: 'photo.jpg',
          fileMimeType: 'image/jpeg',
          fileSizeBytes: 1000,
          status: 'APPROVED',
          rejectionReason: null,
          createdAt: '2026-09-27T11:02:00.000Z',
          reviewedAt: '2026-09-28T10:00:00.000Z',
        },
      },
      {
        type: 'national_id_front',
        label: 'روی کارت ملی',
        required: true,
        canUpload: false,
        canDelete: false,
        displayStatus: 'APPROVED',
        file: {
          id: 'f2',
          fileName: 'id.jpg',
          fileMimeType: 'image/jpeg',
          fileSizeBytes: 1000,
          status: 'APPROVED',
          rejectionReason: null,
          createdAt: '2026-09-27T11:02:00.000Z',
          reviewedAt: '2026-09-28T10:00:00.000Z',
        },
      },
    ],
    history: [
      {
        id: 'h1',
        occurredAt: '2026-09-28T10:00:00.000Z',
        title: 'تأیید نهایی',
        statusLabel: 'تأیید شده',
        tone: 'done',
        description: 'هویت تأیید شد.',
      },
    ],
  };
}

describe('readListTotal', () => {
  it('reads meta.total and a top-level total', () => {
    expect(readListTotal({ meta: { total: 12 } })).toBe(12);
    expect(readListTotal({ total: 25 })).toBe(25);
    expect(readListTotal(null)).toBeNull();
  });
});

describe('ProfileHero', () => {
  it('offers a profile photo upload control and shows mobile plus badges', () => {
    render(<ProfileHero customer={customer} kycPhase="VERIFIED" onUpdated={() => undefined} />);
    expect(screen.getByRole('button', { name: 'تغییر عکس پروفایل' })).toBeInTheDocument();
    expect(screen.getByText('احراز هویت: تکمیل‌شده')).toBeInTheDocument();
    expect(screen.getByText(/وضعیت حساب:/)).toBeInTheDocument();
  });
});

describe('ProfileKycCard', () => {
  it('renders the verified profile copy', () => {
    render(<ProfileKycCard customerStatus="ACTIVE" />);
    expect(screen.getByText('احراز هویت شما تأیید شده است.')).toBeInTheDocument();
    expect(screen.getByText('مشاهده جزئیات').closest('a')).toHaveAttribute(
      'href',
      '/portal/profile#kyc',
    );
  });
});

describe('ProfileKycPanel', () => {
  it('shows the verified document grid without the multi-step timeline', () => {
    render(<ProfileKycPanel overview={verifiedOverview()} onChanged={async () => undefined} />);
    expect(
      screen.getByText('هویت شما با موفقیت تایید شده است و تمامی امکانات معاملاتی فعال می‌باشند.'),
    ).toBeInTheDocument();
    expect(screen.getByText('عکس پرسنلی')).toBeInTheDocument();
    expect(screen.getByText('روی کارت ملی')).toBeInTheDocument();
    expect(screen.queryByLabelText('مراحل احراز هویت')).not.toBeInTheDocument();
    expect(screen.getAllByText('تایید شده').length).toBeGreaterThanOrEqual(1);
  });
});

describe('ProfileTabs', () => {
  it('switches panels when a tab is selected', async () => {
    const user = userEvent.setup();
    render(
      <ProfileTabs
        panels={{
          personal: <div>پنل شخصی</div>,
          kyc: <div>پنل KYC</div>,
          banks: <div>پنل بانکی</div>,
          security: <div>پنل امنیت</div>,
        }}
      />,
    );
    expect(screen.getByText('پنل شخصی')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /مدارک هویتی/ }));
    expect(screen.getByText('پنل KYC')).toBeInTheDocument();
    expect(screen.getByText('پنل شخصی')).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'ویرایش اطلاعات' }));
    expect(
      screen.getByText('برای تغییر اطلاعات هویتی، لطفاً با پشتیبانی تماس بگیرید.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('ایمیل')).toBeInTheDocument();
    expect(screen.queryByLabelText('کد ملی')).not.toBeInTheDocument();
  });
});

describe('ibanBankName', () => {
  it('reads the three-digit bank code after IR and the check digits', () => {
    expect(ibanBankName('IR120560084200001234567890')).toBe('بانک سامان');
    expect(ibanBankName('IR1201200000000000003312')).toBe('بانک ملت');
    expect(ibanBankName('IR1701700000000000000001')).toBe('بانک ملی ایران');
    expect(ibanBankName('IR1299900000000000000001')).toBeNull();
  });

  it('maps IBAN bank codes to react-iranian-bank-logo names', () => {
    expect(ibanBankLogoName('IR120560084200001234567890')).toBe('ir-saman');
    expect(ibanBankLogoName('IR1201200000000000003312')).toBe('ir-mellat');
    expect(ibanBankLogoName('IR1299900000000000000001')).toBe('unknown');
  });

  it('formats IBAN as IR + 2 digits, then fours, then a final pair', () => {
    expect(formatIbanDisplay('IR120560084200001234567890')).toBe(
      'IR12 0560 0842 0000 1234 5678 90',
    );
  });
});

describe('BankAccountsCard', () => {
  beforeEach(() => {
    bankAccountStore.accounts = [];
  });

  it('shows the empty state by default', async () => {
    render(<BankAccountsCard customerId="c-empty" holderName="علی رضایی" />);
    expect(await screen.findByText('حساب بانکی تأییدشده‌ای ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'افزودن شماره شبا' })).toBeInTheDocument();
    expect(screen.getByText(/علی رضایی/)).toBeInTheDocument();
  });

  it('lists mock accounts and can remove one', async () => {
    const user = userEvent.setup();
    render(<BankAccountsCard showDemoAccounts />);
    expect(screen.getByText(/IR12 0560 0842 0000 1234 8421/)).toBeInTheDocument();
    expect(screen.getByText('بانک سامان')).toBeInTheDocument();
    expect(screen.getByLabelText('بانک سامان')).toBeInTheDocument();
    expect(screen.getByText('بانک ملت')).toBeInTheDocument();
    expect(screen.getByLabelText('بانک ملت')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'افزودن حساب بانکی جدید' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /حذف شبا/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'حذف حساب' }));
    expect(screen.queryByText(/IR12 0560 0842 0000 1234 8421/)).not.toBeInTheDocument();
  });

  it('opens the add-IBAN modal and enables submit after 24 digits', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BankAccountsCard customerId="c-add" holderName="علی رضایی" />);
    await user.click(screen.getByRole('button', { name: 'افزودن شماره شبا' }));
    expect(screen.getByRole('heading', { name: 'افزودن شماره شبا جدید' })).toBeInTheDocument();
    expect(screen.getByText(/هویت تأییدشده شما/)).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'تایید و ثبت شماره شبا' });
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByLabelText('شماره شبا (IBAN)'),
      '120560084200001234567890',
    );
    expect(screen.getByText('بانک سامان')).toBeInTheDocument();
    expect(screen.getByText(/تطابق هویت/)).toBeInTheDocument();
    expect(screen.getByText(/صاحب حساب: علی رضایی/)).toBeInTheDocument();
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(await screen.findByText('شماره شبا')).toBeInTheDocument();
    expect(screen.getByText(/IR12 0560 0842 0000 1234 5678 90/)).toBeInTheDocument();

    unmount();
    render(<BankAccountsCard customerId="c-add" holderName="علی رضایی" />);
    expect(await screen.findByText(/IR12 0560 0842 0000 1234 5678 90/)).toBeInTheDocument();
    await waitFor(() => {
      expect(bankAccountStore.accounts).toHaveLength(1);
    });
  });
});
