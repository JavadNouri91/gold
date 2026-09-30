'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  Users,
  ShieldCheck,
  ShoppingCart,
  ClipboardList,
  TrendingUp,
  Scale,
  Truck,
  Coins,
} from 'lucide-react';
import { reportsApi } from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, MetricCard } from '@/components/dashboard/page-header';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { StatusBadge } from '@/components/portal/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  formatWeight,
  statusLabel,
} from '@/lib/utils';

function count(value: number): string {
  return value.toLocaleString('fa-IR');
}

export default function OverviewPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'financial_report.read');
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? 'reports/dashboard' : null,
    () => reportsApi.dashboard(),
  );

  if (!allowed) return <ForbiddenNotice permission="financial_report.read" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="نمای مدیریت"
        description="اعداد این صفحه مستقیماً از گزارش تجمیعی سرور خوانده می‌شوند."
      />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-28" />
          ))}
        </div>
      ) : null}
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      {data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Users} label="مشتریان" value={count(data.totalCustomers)} hint={`فعال ${count(data.activeCustomers)}`} />
            <MetricCard icon={ShieldCheck} label="احراز هویت در انتظار" value={count(data.pendingKyc)} />
            <MetricCard icon={ShoppingCart} label="سفارش‌های در جریان گزارش" value={count(data.pendingOrders)} hint={`کل سفارش‌ها ${count(data.ordersTotal)}`} />
            <MetricCard icon={ClipboardList} label="سفارش‌های منتظر بررسی" value={count(data.ordersAwaitingReview)} />
            <MetricCard icon={TrendingUp} label="معاملات تأییدشده" value={count(data.confirmedTrades)} hint={formatMoney(data.totalTradeValueRial)} />
            <MetricCard icon={Scale} label="معاملات تسویه‌نشده" value={count(data.unsettledTrades)} hint={`پرداخت‌های ثبت‌شده ${count(data.totalPaymentsRecorded)}`} />
            <MetricCard icon={Truck} label="تعهد به تأمین‌کننده" value={formatMoney(data.supplierPayableRial)} />
            <MetricCard icon={Coins} label="موقعیت طلا" value={formatWeight(data.goldPositionGrams)} hint={`تعهد طلا ${formatWeight(data.goldObligationGrams)}`} />
          </section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="درآمد فروش ثبت‌شده" value={formatMoney(data.salesRevenueRial)} />
            <MetricCard label="بهای خرید ثبت‌شده" value={formatMoney(data.purchaseCostRial)} />
            <MetricCard label="ارزش پرداخت‌ها" value={formatMoney(data.totalPaymentsValueRial)} />
            <MetricCard label="وزن معاملات" value={formatWeight(data.totalTradeWeightGrams)} />
          </section>
          <p className="text-xs text-muted-foreground">
            مصرف اعتبار در این گزارش تجمیعی وجود ندارد و از صفحه حساب مشتری، با همان اعداد سرور، دیده می‌شود.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>معاملات اخیر</CardTitle></CardHeader>
              <CardContent>
                {data.recentTrades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">معامله‌ای ثبت نشده است.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recentTrades.map((trade) => (
                      <li key={trade.id} className="flex items-center justify-between py-3 text-sm">
                        <Link href={`/dashboard/trades/${trade.id}`} className="font-medium" dir="ltr">{trade.tradeNumber}</Link>
                        <span>{formatMoney(trade.totalAmountRial)}</span>
                        <StatusBadge status={trade.status} label={statusLabel(TRADE_STATUS_LABELS, trade.status)} />
                        <span className="text-xs text-muted-foreground">{formatDateTime(trade.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>پرداخت‌های اخیر</CardTitle></CardHeader>
              <CardContent>
                {data.recentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">پرداختی ثبت نشده است.</p>
                ) : (
                  <ul className="divide-y">
                    {data.recentPayments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                        <Link href={`/dashboard/payments/${payment.id}`} className="font-medium">مشاهده</Link>
                        <span>{statusLabel(PAYMENT_METHOD_LABELS, payment.method)}</span>
                        <span>{formatMoney(payment.amount)}</span>
                        <StatusBadge status={payment.status} label={statusLabel(PAYMENT_STATUS_LABELS, payment.status)} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
