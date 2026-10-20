'use client';

import Link from 'next/link';
import { ArrowDown, ArrowUp, Package, WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACTIONS = [
  {
    href: '/portal/orders/new?side=buy',
    label: 'خرید سریع طلا',
    icon: ArrowUp,
    wrap: 'border-emerald-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
    iconWrap: 'bg-emerald-100 text-emerald-700',
  },
  {
    href: '/portal/orders/new?side=sell',
    label: 'فروش سریع طلا',
    icon: ArrowDown,
    wrap: 'border-rose-100 bg-rose-50 text-rose-800 hover:bg-rose-100',
    iconWrap: 'bg-rose-100 text-rose-700',
  },
  {
    href: '/portal/payments',
    label: 'واریز و برداشت',
    icon: WalletCards,
    wrap: 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100',
    iconWrap: 'bg-slate-200/80 text-slate-700',
  },
  {
    href: '/portal/pickups/new',
    label: 'درخواست تحویل حضوری',
    icon: Package,
    wrap: 'border-amber-100 bg-amber-50 text-amber-900 hover:bg-amber-100',
    iconWrap: 'bg-amber-100 text-amber-800',
  },
] as const;

export function QuickActions() {
  return (
    <section className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Link
            key={action.label}
            href={action.href}
            className={cn(
              'flex min-h-12 items-center gap-2.5 rounded-2xl border px-3 py-2.5 shadow-sm transition-colors',
              action.wrap,
            )}
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                action.iconWrap,
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 text-start text-xs font-semibold leading-5 sm:text-sm">
              {action.label}
            </span>
          </Link>
        );
      })}
    </section>
  );
}
