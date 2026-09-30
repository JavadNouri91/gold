'use client';
import useSWR from 'swr';
import { customerApi, ordersApi, pricingApi, tradesApi } from '@/lib/api';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert } from '@/components/ui/alert';
import { GoldPriceCard } from '@/components/portal/gold-price-card';
import { PortfolioCard } from '@/components/portal/portfolio-card';
import { TradingCreditCard } from '@/components/portal/trading-credit-card';
import { KycStatusCard } from '@/components/portal/kyc-status-card';
import { QuickActions } from '@/components/portal/quick-actions';
import { ActiveOrders } from '@/components/portal/active-orders';
import { RecentTransactions } from '@/components/portal/recent-transactions';
import { DEMO_ACTIVE_ORDERS, DEMO_RECENT_TRADES } from '@/lib/portal-demo';

export default function DashboardPage() {
  const { data: customer, error: customerError, isLoading: customerLoading } =
    useSWR('customer/me', () => customerApi.getMe());

  const { data: account, isLoading: accountLoading } =
    useSWR('customer/me/account', () => customerApi.getMyAccount());

  const { data: price, isValidating: priceRefreshing, mutate: refreshPrice } =
    useSWR('pricing/current-price', () => pricingApi.getCurrentPrice());

  const { data: ordersResp } =
    useSWR('orders/recent', () => ordersApi.list({ limit: 5 }));

  const { data: tradesResp } =
    useSWR('trades/recent', () => tradesApi.list({ limit: 5 }));

  if ((customerLoading && !customerError) || (accountLoading && !account)) return <PageSpinner />;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      {customerError ? <Alert variant="error">خطا در بارگذاری اطلاعات مشتری</Alert> : null}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <GoldPriceCard
            price={price}
            isRefreshing={priceRefreshing}
            onRefresh={() => void refreshPrice()}
          />
        </div>
        <div className="xl:col-span-4">
          <PortfolioCard />
        </div>
        <div className="flex flex-col gap-4 xl:col-span-3">
          {account ? <TradingCreditCard account={account} /> : null}
          <KycStatusCard customerStatus={customer?.status} />
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
        <ActiveOrders
          orders={ordersResp?.data?.length ? ordersResp.data.slice(0, 5) : DEMO_ACTIVE_ORDERS}
        />
        <RecentTransactions
          trades={tradesResp?.data?.length ? tradesResp.data.slice(0, 5) : DEMO_RECENT_TRADES}
        />
      </div>
    </div>
  );
}
