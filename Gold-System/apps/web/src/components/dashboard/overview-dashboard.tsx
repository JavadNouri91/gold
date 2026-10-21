'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import useSWR from 'swr';
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardList,
  Coins,
  FileText,
  Scale,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { ApiClientError, pricingApi } from '@/lib/api';
import { tradingApi, type DashboardSummary } from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  cn,
  formatDateTime,
  formatFaNumber,
  formatMoney,
  formatWeight,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

const MARKET_READ = [
  'trading.schedule.view',
  'trading.schedule.manage',
  'trading.limits.view',
  'trading.limits.manage',
  'trading.holidays.manage',
  'trading.audit.view',
] as const;

function count(value: number): string {
  return formatFaNumber(value);
}

function grams(value: string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function OverviewDashboard({ data }: { data: DashboardSummary }) {
  return (
    <div className="space-y-6 font-[family-name:var(--font-vazirmatn)]" dir="rtl">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">داشبورد مدیریت سامانه</h1>
        <MarketControl />
      </header>

      <section>
        <div className="grid gap-4 lg:grid-cols-3">
          <UrgentCard
            href="/dashboard/orders?view=review"
            tone="amber"
            icon={ClipboardList}
            value={count(data.ordersAwaitingReview)}
            label="سفارش منتظر بررسی"
            action="بررسی سفارش‌ها"
          />
          <UrgentCard
            href="/dashboard/kyc"
            tone="indigo"
            icon={ShieldCheck}
            value={count(data.pendingKyc)}
            label="احراز هویت در انتظار"
            action="بررسی مدارک"
          />
          <UrgentCard
            href="/dashboard/settlements"
            tone={data.unsettledTrades > 0 ? 'rose' : 'slate'}
            icon={Scale}
            value={count(data.unsettledTrades)}
            label="معاملات تسویه‌نشده"
            hint={`${count(data.totalPaymentsRecorded)} پرداخت ثبت‌شده`}
          />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GoldExposureCard position={data.goldPositionGrams} obligation={data.goldObligationGrams} />
        <TradeBalanceCard
          sales={data.salesRevenueRial}
          purchases={data.purchaseCostRial}
          weight={data.totalTradeWeightGrams}
        />
        <CashflowCard payments={data.totalPaymentsValueRial} supplier={data.supplierPayableRial} />
        <CustomersCard
          customers={data.totalCustomers}
          active={data.activeCustomers}
          orders={data.ordersTotal}
          confirmed={data.confirmedTrades}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <RecentTrades trades={data.recentTrades} />
        <RecentPayments payments={data.recentPayments} />
      </section>
    </div>
  );
}

function MarketControl() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, MARKET_READ);
  const canManage = hasPermission(user?.permissions, 'trading.schedule.manage');
  const market = useSWR(canRead ? 'overview-market' : null, () => tradingApi.overview());
  const price = useSWR('overview-gold-price', async () => {
    try {
      return await pricingApi.getCurrentPrice();
    } catch {
      return null;
    }
  });
  const [pending, setPending] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  const enabled = Boolean(market.data?.scheduleEnabled);
  const open = Boolean(market.data?.open);
  const statusLabelText = !market.data ? 'در حال دریافت' : open ? 'بازار فعال' : 'بازار بسته';

  const toggle = async () => {
    if (!canManage || !market.data || pending) return;
    setPending(true);
    setToggleError(null);
    try {
      await tradingApi.setMarket(!enabled);
      await market.mutate();
    } catch (error) {
      setToggleError(error instanceof ApiClientError ? error.message : 'تغییر وضعیت بازار انجام نشد.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white px-3 py-2 shadow-sm">
        <div className="min-w-[9rem] px-1">
          <p className="text-[11px] text-slate-500">نرخ لحظه‌ای طلا</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">
            {price.data?.normalizedValue ? formatMoney(price.data.normalizedValue) : '—'}
          </p>
        </div>
        <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
        {canManage ? (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="وضعیت بازار"
            disabled={!market.data || pending}
            onClick={() => void toggle()}
            className="flex items-center gap-2 rounded-xl px-1 py-1 disabled:opacity-60"
          >
            <span className={cn('text-sm font-semibold', open ? 'text-emerald-700' : 'text-slate-600')}>
              {statusLabelText}
            </span>
            <span
              className={cn(
                'relative inline-flex h-6 w-11 rounded-full transition-colors',
                enabled ? 'bg-emerald-500' : 'bg-slate-300',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                  enabled ? 'left-0.5' : 'right-0.5',
                )}
              />
            </span>
          </button>
        ) : (
          <span className="flex items-center gap-2 px-1 text-sm font-semibold text-slate-600">
            <span className={cn('h-2 w-2 rounded-full', open ? 'bg-emerald-500' : 'bg-slate-400')} />
            {canRead ? statusLabelText : 'وضعیت بازار'}
          </span>
        )}
      </div>
      {market.data?.scheduleEnabled && !market.data.open ? (
        <p className="px-1 text-[11px] text-slate-500">برنامه معاملات روشن است و الان خارج از ساعت کاری است.</p>
      ) : null}
      {toggleError ? <p className="px-1 text-[11px] text-rose-600">{toggleError}</p> : null}
    </div>
  );
}

const URGENT_TONE = {
  amber: {
    shell: 'border-amber-200/80 bg-amber-50',
    icon: 'bg-amber-100 text-amber-700',
    value: 'text-amber-950',
    label: 'text-amber-900',
    action: 'text-amber-800',
  },
  indigo: {
    shell: 'border-indigo-200/80 bg-indigo-50',
    icon: 'bg-indigo-100 text-indigo-700',
    value: 'text-indigo-950',
    label: 'text-indigo-900',
    action: 'text-indigo-800',
  },
  rose: {
    shell: 'border-rose-200/80 bg-rose-50',
    icon: 'bg-rose-100 text-rose-700',
    value: 'text-rose-950',
    label: 'text-rose-900',
    action: 'text-rose-800',
  },
  slate: {
    shell: 'border-slate-200/80 bg-slate-50',
    icon: 'bg-slate-200 text-slate-600',
    value: 'text-slate-900',
    label: 'text-slate-700',
    action: 'text-slate-700',
  },
} as const;

function UrgentCard({
  href,
  tone,
  icon: Icon,
  value,
  label,
  hint,
  action,
}: {
  href: string;
  tone: keyof typeof URGENT_TONE;
  icon: typeof ClipboardList;
  value: string;
  label: string;
  hint?: string;
  action?: string;
}) {
  const colors = URGENT_TONE[tone];
  return (
    <Link
      href={href}
      className={cn(
        'block rounded-2xl border p-5 shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-400',
        colors.shell,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colors.icon)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className={cn('text-sm font-semibold', colors.label)}>{label}</p>
        </div>
        <p className={cn('shrink-0 text-3xl font-bold tabular-nums', colors.value)}>{value}</p>
      </div>
      {hint ? <p className="mt-3 text-xs text-slate-600">{hint}</p> : null}
      {action ? (
        <p className={cn('mt-4 inline-flex items-center gap-1 text-sm font-semibold', colors.action)}>
          {action}
          <span aria-hidden="true">←</span>
        </p>
      ) : null}
    </Link>
  );
}

function Panel({
  title,
  icon: Icon,
  href,
  children,
  critical,
}: {
  title: string;
  icon?: typeof Coins;
  href?: string;
  children: ReactNode;
  critical?: boolean;
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm',
        critical ? 'border-amber-200/90' : 'border-slate-200/80',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        {Icon ? <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" /> : null}
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
      {href ? (
        <Link href={href} className="mt-4 text-xs font-medium text-gold-800">
          مشاهده بخش
        </Link>
      ) : null}
    </section>
  );
}

function GoldExposureCard({
  position,
  obligation,
}: {
  position: string | null;
  obligation: string | null;
}) {
  const held = grams(position);
  const owed = grams(obligation);
  const coverage = owed <= 0 ? (held > 0 ? 100 : 0) : Math.min(100, (held / owed) * 100);
  const gap = Math.abs(owed - held);
  const gapText = formatWeight(gap.toFixed(6));
  const balanced = gap < 0.000001;
  const surplus = held >= owed;

  return (
    <Panel title="تراز و موقعیت طلا" icon={Coins} href="/dashboard/ledger/gold" critical>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-slate-500">موقعیت فعلی</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatWeight(position)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">تعهد طلا به مشتریان</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatWeight(obligation)}</p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div
          className={cn('h-full rounded-full', surplus ? 'bg-emerald-500' : coverage > 0 ? 'bg-amber-500' : 'bg-rose-500')}
          style={{ width: `${coverage}%` }}
        />
      </div>
      <p className={cn('mt-2 text-xs font-medium', surplus ? 'text-emerald-700' : 'text-rose-700')}>
        {balanced ? 'موقعیت و تعهد برابر است' : surplus ? `مازاد ${gapText}` : `کسری پوشش ${gapText}`}
      </p>
    </Panel>
  );
}

function TradeBalanceCard({
  sales,
  purchases,
  weight,
}: {
  sales: string | null;
  purchases: string | null;
  weight: string | null;
}) {
  return (
    <Panel title="تراز معاملات" href="/dashboard/trades">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">درآمد فروش ثبت‌شده</p>
            <p className="mt-1 text-base font-bold tabular-nums text-emerald-700">{formatMoney(sales)}</p>
          </div>
          <ArrowUpRight className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        </div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500">بهای خرید ثبت‌شده</p>
            <p className="mt-1 text-base font-bold tabular-nums text-rose-700">{formatMoney(purchases)}</p>
          </div>
          <ArrowDownRight className="h-4 w-4 text-rose-600" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-auto pt-4">
        <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {formatWeight(weight)} وزن کل معاملات
        </span>
      </p>
    </Panel>
  );
}

function CashflowCard({ payments, supplier }: { payments: string | null; supplier: string | null }) {
  return (
    <Panel title="گردش ریالی و پرداخت‌ها" icon={Wallet} href="/dashboard/payments">
      <p className="text-xs text-slate-500">ارزش کل پرداخت‌ها</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{formatMoney(payments)}</p>
      <p className="mt-3 text-xs text-slate-500">
        تعهد به تأمین‌کننده: <span className="font-semibold text-slate-800">{formatMoney(supplier)}</span>
      </p>
    </Panel>
  );
}

function CustomersCard({
  customers,
  active,
  orders,
  confirmed,
}: {
  customers: number;
  active: number;
  orders: number;
  confirmed: number;
}) {
  return (
    <Panel title="وضعیت مشتریان و سفارشات" icon={Users}>
      <div className="space-y-3 text-sm">
        <p>
          <Link href="/dashboard/customers" className="font-bold text-slate-900">
            {count(customers)} مشتری کل
          </Link>
          <span className="text-slate-500"> ({count(active)} فعال)</span>
        </p>
        <p>
          <Link href="/dashboard/orders" className="font-bold text-slate-900">
            {count(orders)} کل سفارش‌ها
          </Link>
          <span className="text-slate-500"> ({count(confirmed)} معامله تأییدشده)</span>
        </p>
      </div>
    </Panel>
  );
}

function RecentTrades({ trades }: { trades: DashboardSummary['recentTrades'] }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">معاملات اخیر</h2>
        <Link href="/dashboard/trades" className="text-sm font-medium text-gold-800">
          همه معاملات
        </Link>
      </header>
      {trades.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">معامله‌ای ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-2 text-right font-medium">شناسه</th>
                <th className="px-4 py-2 text-right font-medium">مشتری</th>
                <th className="px-4 py-2 text-right font-medium">نوع</th>
                <th className="px-4 py-2 text-right font-medium">وزن</th>
                <th className="px-4 py-2 text-right font-medium">مبلغ</th>
                <th className="px-4 py-2 text-right font-medium">تاریخ</th>
                <th className="px-4 py-2 text-right font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/trades/${trade.id}`} className="font-medium text-slate-900" dir="ltr">
                      {toPersianDigits(trade.tradeNumber)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {trade.customerId ? (
                      <Link href={`/dashboard/customers/${trade.customerId}`}>{trade.customerName || 'مشتری'}</Link>
                    ) : (
                      trade.customerName || '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <SideBadge side={trade.side} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{formatWeight(trade.weightGrams)}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-800">{formatMoney(trade.totalAmountRial)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                    {formatDateTime(trade.confirmedAt ?? trade.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={trade.status} label={statusLabel(TRADE_STATUS_LABELS, trade.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function SideBadge({ side }: { side: 'BUY' | 'SELL' | null }) {
  if (side === 'BUY') {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">خرید</span>;
  }
  if (side === 'SELL') {
    return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">فروش</span>;
  }
  return <span className="text-xs text-slate-400">—</span>;
}

function RecentPayments({ payments }: { payments: DashboardSummary['recentPayments'] }) {
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">پرداخت‌های اخیر</h2>
        <Link href="/dashboard/payments" className="text-sm font-medium text-gold-800">
          همه پرداخت‌ها
        </Link>
      </header>
      {payments.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-500">پرداختی ثبت نشده است.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-2 text-right font-medium">مشتری</th>
                <th className="px-4 py-2 text-right font-medium">مبلغ</th>
                <th className="px-4 py-2 text-right font-medium">روش</th>
                <th className="px-4 py-2 text-right font-medium">وضعیت</th>
                <th className="px-4 py-2 text-right font-medium">فیش</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-800">
                    {payment.customerId ? (
                      <Link href={`/dashboard/customers/${payment.customerId}`}>
                        {payment.customerName || 'مشتری'}
                      </Link>
                    ) : (
                      payment.customerName || '—'
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-medium text-slate-900">{formatMoney(payment.amount)}</td>
                  <td className="px-4 py-3 text-slate-600">{statusLabel(PAYMENT_METHOD_LABELS, payment.method)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      status={payment.status}
                      label={statusLabel(PAYMENT_STATUS_LABELS, payment.status)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    {payment.hasReceipt ? (
                      <Link
                        href={`/dashboard/payments/${payment.id}`}
                        aria-label="مشاهده فیش"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    ) : (
                      <span
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-300"
                        title="فیشی ثبت نشده"
                      >
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
