'use client';
import useSWR from 'swr';
import { ApiClientError, customerApi, ordersApi, pricingApi, tradesApi } from '@/lib/api';
import { toPortfolioPosition } from '@/lib/customer-portfolio';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { DashboardHero } from '@/components/portal/dashboard-hero';
import { GoldPriceCard } from '@/components/portal/gold-price-card';
import { PortfolioCard } from '@/components/portal/portfolio-card';
import { BuyPowerCard } from '@/components/portal/buy-power-card';
import { QuickActions } from '@/components/portal/quick-actions';
import { ActiveOrders } from '@/components/portal/active-orders';
import { RecentTransactions } from '@/components/portal/recent-transactions';

function isNotFound(error: unknown): boolean {
  return error instanceof ApiClientError && error.isNotFound;
}

export default function DashboardPage() {
  const { error: customerError, isLoading: customerLoading } =
    useSWR('customer/me', () => customerApi.getMe());

  const { data: price, isValidating: priceRefreshing, mutate: refreshPrice } =
    useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());

  const { data: ordersResp } =
    useSWR('orders/recent', () => ordersApi.list({ limit: 100 }));

  const { data: tradesResp } =
    useSWR('trades/recent', () => tradesApi.list({ limit: 100 }));

  const { data: holding } = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const { data: account } = useSWR('customer/me/account', () => customerApi.getMyAccount());
  const position = toPortfolioPosition(holding, price?.normalizedValue);
  const customerMissing = isNotFound(customerError);
  const customerLoadFailed = Boolean(customerError) && !customerMissing;
  if (customerLoading && !customerError) {
    return <PageSpinner />;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4" dir="rtl">
      {customerMissing ? (
        <Alert variant="info">پروفایل مشتری برای این حساب کاربری ثبت نشده است.</Alert>
      ) : null}
      {customerLoadFailed ? <Alert variant="error">خطا در بارگذاری اطلاعات مشتری</Alert> : null}

      <DashboardHero account={account} position={position} />

      <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-3">
        <GoldPriceCard
          price={price}
          isRefreshing={priceRefreshing}
          onRefresh={() => void refreshPrice()}
        />
        <PortfolioCard position={position} />
        <BuyPowerCard price={price} />
      </div>

      <QuickActions />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <ActiveOrders orders={ordersResp?.data ?? []} />
        <RecentTransactions trades={tradesResp?.data ?? []} />
      </div>
    </div>
  );
}
