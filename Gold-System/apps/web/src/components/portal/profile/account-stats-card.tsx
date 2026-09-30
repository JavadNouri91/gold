'use client';

import { BarChart3, Coins, ShoppingCart } from 'lucide-react';
import { DEMO_PORTFOLIO } from '@/lib/portal-demo';
import { toPersianDigits } from '@/lib/utils';
import { readListTotal } from './read-list-total';

export function AccountStatsCard({
  orders,
  trades,
  ordersLoading,
  tradesLoading,
  ordersError,
  tradesError,
}: {
  orders: unknown;
  trades: unknown;
  ordersLoading?: boolean;
  tradesLoading?: boolean;
  ordersError?: boolean;
  tradesError?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-800">آمار حساب کاربری</h2>
      <div className="mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <StatTile
          icon={Coins}
          label="موجودی طلا (گرم)"
          value={toPersianDigits(DEMO_PORTFOLIO.weightGrams)}
          note="نمونه نمایشی"
        />
        <StatTile
          icon={ShoppingCart}
          label="تعداد سفارش‌ها"
          value={countLabel(readListTotal(orders), ordersLoading, ordersError)}
        />
        <StatTile
          icon={BarChart3}
          label="تعداد معاملات"
          value={countLabel(readListTotal(trades), tradesLoading, tradesError)}
        />
      </div>
    </section>
  );
}

function countLabel(total: number | null, loading?: boolean, error?: boolean): string {
  if (loading) return '…';
  if (error || total == null) return '—';
  return toPersianDigits(String(total));
}

function StatTile({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Coins;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-3 text-center">
      <Icon className="mx-auto h-4 w-4 text-gold-700" aria-hidden />
      <p className="mt-2 text-base font-bold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{label}</p>
      {note ? <p className="mt-1 text-[10px] font-medium text-amber-700">{note}</p> : null}
    </div>
  );
}
