'use client';

import useSWR from 'swr';
import { ApiClientError, customerApi, kycApi } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { PageSpinner } from '@/components/ui/spinner';
import { BankAccountsCard } from '@/components/portal/profile/bank-accounts-card';
import { PersonalInformationCard } from '@/components/portal/profile/personal-information-card';
import { ProfileHero } from '@/components/portal/profile/profile-hero';
import { ProfileKycPanel } from '@/components/portal/profile/profile-kyc-panel';
import { ProfilePreferences } from '@/components/portal/profile/profile-preferences';
import { ProfileTabs } from '@/components/portal/profile/profile-tabs';
import { SecurityCard } from '@/components/portal/profile/security-card';
import { KycLoadError, KycSkeleton } from '@/components/portal/kyc/kyc-experience';

export default function ProfilePage() {
  const {
    data: customer,
    error: customerError,
    isLoading: customerLoading,
    mutate: mutateCustomer,
  } = useSWR('customer/me', () => customerApi.getMe());

  const {
    data: kyc,
    error: kycError,
    isLoading: kycLoading,
    mutate: mutateKyc,
  } = useSWR('kyc/me', () => kycApi.getMine());

  if (customerLoading) return <PageSpinner />;
  if (customerError instanceof ApiClientError && customerError.isNotFound) {
    return <Alert variant="info">پروفایل مشتری برای این حساب کاربری ثبت نشده است.</Alert>;
  }
  if (customerError || !customer) {
    return <Alert variant="error">خطا در بارگذاری پروفایل</Alert>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <header>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">پروفایل من و مدارک هویتی</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          مدیریت اطلاعات شخصی، مدارک احراز هویت، حساب‌های بانکی و تنظیمات امنیتی
        </p>
      </header>

      <ProfileHero
        customer={customer}
        kycPhase={kyc?.phase}
        onUpdated={() => mutateCustomer()}
      />

      <ProfileTabs
        panels={{
          personal: (
            <PersonalInformationCard customer={customer} onSaved={() => mutateCustomer()} />
          ),
          kyc:
            kycLoading && !kyc ? (
              <KycSkeleton />
            ) : kycError || !kyc ? (
              <KycLoadError onRetry={() => void mutateKyc()} />
            ) : (
              <ProfileKycPanel overview={kyc} onChanged={() => mutateKyc()} />
            ),
          banks: (
            <BankAccountsCard
              customerId={customer.id}
              holderName={`${customer.firstName} ${customer.lastName}`.trim()}
            />
          ),
          security: (
            <div className="space-y-4">
              <SecurityCard />
              <ProfilePreferences />
            </div>
          ),
        }}
      />
    </div>
  );
}