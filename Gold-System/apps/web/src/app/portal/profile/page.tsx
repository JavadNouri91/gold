'use client';

import useSWR from 'swr';
import { ApiClientError, customerApi, ordersApi, tradesApi } from '@/lib/api';
import { Alert } from '@/components/ui/alert';
import { PageSpinner } from '@/components/ui/spinner';
import { AccountStatsCard } from '@/components/portal/profile/account-stats-card';
import { BankAccountsCard } from '@/components/portal/profile/bank-accounts-card';
import { DeleteAccountCard } from '@/components/portal/profile/delete-account-card';
import { PersonalInformationCard } from '@/components/portal/profile/personal-information-card';
import { ProfileCreditCard } from '@/components/portal/profile/profile-credit-card';
import { ProfileHero } from '@/components/portal/profile/profile-hero';
import { ProfileKycCard } from '@/components/portal/profile/profile-kyc-card';
import { readListTotal } from '@/components/portal/profile/read-list-total';
import { SecurityCard } from '@/components/portal/profile/security-card';

export default function ProfilePage() {
  const {
    data: customer,
    error: customerError,
    isLoading: customerLoading,
    mutate,
  } = useSWR('customer/me', () => customerApi.getMe());

  const {
    data: account,
    error: accountError,
    isLoading: accountLoading,
  } = useSWR('customer/me/account', () => customerApi.getMyAccount());

  const {
    data: orders,
    error: ordersError,
    isLoading: ordersLoading,
  } = useSWR('profile/orders-count', () => ordersApi.list({ limit: 1 }));

  const {
    data: trades,
    error: tradesError,
    isLoading: tradesLoading,
  } = useSWR('profile/trades-count', () => tradesApi.list({ limit: 1 }));

  if (customerLoading) return <PageSpinner />;
  if (customerError instanceof ApiClientError && customerError.isNotFound) {
    return <Alert variant="info">پروفایل مشتری برای این حساب کاربری ثبت نشده است.</Alert>;
  }
  if (customerError || !customer) {
    return <Alert variant="error">خطا در بارگذاری پروفایل</Alert>;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <ProfileHero customer={customer} onUpdated={() => mutate()} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="order-2 flex flex-col gap-4 xl:order-1 xl:col-span-3">
          <ProfileKycCard customerStatus={customer.status} />
          <ProfileCreditCard
            account={account}
            isLoading={accountLoading}
            unavailable={accountError instanceof ApiClientError && accountError.isNotFound}
            hasError={
              Boolean(accountError) &&
              !(accountError instanceof ApiClientError && accountError.isNotFound)
            }
          />
          <AccountStatsCard
            orders={orders}
            trades={trades}
            ordersLoading={ordersLoading}
            tradesLoading={tradesLoading}
            ordersError={Boolean(ordersError)}
            tradesError={Boolean(tradesError)}
          />
        </div>

        <div className="order-1 xl:order-2 xl:col-span-6">
          <PersonalInformationCard customer={customer} onSaved={() => mutate()} />
        </div>

        <div className="order-3 flex flex-col gap-4 xl:order-3 xl:col-span-3">
          <SecurityCard />
          <BankAccountsCard />
          <DeleteAccountCard
            account={account}
            orderCount={ordersError ? null : readListTotal(orders)}
            tradeCount={tradesError ? null : readListTotal(trades)}
            countsLoading={ordersLoading || tradesLoading || accountLoading}
          />
        </div>
      </div>
    </div>
  );
}
