'use client';
import useSWR from 'swr';
import { ApiClientError, customerApi, ordersApi, pricingApi, tradesApi } from '@/lib/api';
import { toPortfolioPosition } from '@/lib/customer-portfolio';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
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
  const { data: customer, error: customerError, isLoading: customerLoading } =
    useSWR('customer/me', () => customerApi.getMe());

  const { data: price, isValidating: priceRefreshing, mutate: refreshPrice } =
    useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());

  const { data: ordersResp } =
    useSWR('orders/recent', () => ordersApi.list({ limit: 100 }));

  const { data: tradesResp } =
    useSWR('trades/recent', () => tradesApi.list({ limit: 100 }));

  const { data: holding } = useSWR('orders/portfolio', () => ordersApi.portfolio());
  const position = toPortfolioPosition(holding, price?.normalizedValue);
  const customerMissing = isNotFound(customerError);
  const customerLoadFailed = Boolean(customerError) && !customerMissing;

  if (customerLoading && !customerError) {
    return <PageSpinner />;
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      {customerMissing ? (
        <Alert variant="info">پروفایل مشتری برای این حساب کاربری ثبت نشده است.</Alert>
      ) : null}
      {customerLoadFailed ? <Alert variant="error">خطا در بارگذاری اطلاعات مشتری</Alert> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <GoldPriceCard
            price={price}
            isRefreshing={priceRefreshing}
            onRefresh={() => void refreshPrice()}
          />
        </div>
        <div className="xl:col-span-4">
          <PortfolioCard position={position} />
        </div>
        <div className="xl:col-span-3">
          <BuyPowerCard price={price} />
        </div>
      </div>

      <QuickActions />

      <div className="overflow-hidden rounded-2xl border border-gold-100 bg-gradient-to-l from-gold-50 to-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-800">قیمت لحظه‌ای طلا در دستان شما</p>
            <p className="mt-1 text-xs text-muted-foreground">
              با استفاده از سامانه طلا سریع و امن معامله کنید.
            </p>
          </div>
          <svg width="88" height="48" viewBox="0 0 88 48" aria-hidden className="hidden shrink-0 sm:block">
            <rect x="28" y="4" width="40" height="14" rx="3" fill="#eab308" />
            <rect x="16" y="16" width="56" height="14" rx="3" fill="#ca8a04" />
            <rect x="6" y="28" width="72" height="16" rx="3" fill="#a16207" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ActiveOrders orders={ordersResp?.data ?? []} />
        <RecentTransactions trades={tradesResp?.data ?? []} />
      </div>
    </div>
  );
}
