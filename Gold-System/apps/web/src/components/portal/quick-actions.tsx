'use client';

import Link from 'next/link';
import { History, ShoppingCart, BarChart3, WalletCards } from 'lucide-react';

const ACTIONS = [
  { href: '/portal/payments', label: 'تاریخچه پرداخت', icon: WalletCards, className: 'bg-sky-50 text-sky-800' },
  { href: '/portal/trades', label: 'تاریخچه معاملات', icon: History, className: 'bg-violet-50 text-violet-800' },
  { href: '/portal/orders/new', label: 'سفارش جدید', icon: ShoppingCart, className: 'bg-emerald-50 text-emerald-800' },
  { href: '/portal/trades', label: 'گزارش‌ها', icon: BarChart3, className: 'bg-gold-50 text-gold-800' },
] as const;

export function QuickActions() {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-4 text-center shadow-sm hover:shadow-md ${action.className}`}
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-xs font-semibold text-slate-800">{action.label}</span>
          </Link>
        );
      })}
    </section>
  );
}
