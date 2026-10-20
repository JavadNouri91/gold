'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import type { Order } from '@/lib/api';
import { StatusBadge } from '@/components/portal/status-badge';
import { cn, formatDate, formatWholeMoney, formatWeight, orderStatusPresentation, toPersianDigits } from '@/lib/utils';
import {
  ORDER_PERIOD_LABELS,
  filterOrdersByPeriod,
  type OrderPeriod,
} from '@/lib/order-period';
import type { DemoOrderRow, DemoSide } from '@/lib/portal-demo';

export type ActiveOrderRow = (Order & { side?: DemoSide; unitPriceRial?: string; statusLabel?: string; demo?: boolean }) | DemoOrderRow;

function rowPrice(order: ActiveOrderRow): string {
  if ('totalAmountRial' in order) return order.totalAmountRial;
  return order.unitPriceRial;
}

function sideMeta(side?: DemoSide | null) {
  if (side === 'SELL') return { label: 'فروش', className: 'text-red-700' };
  if (side === 'BUY') return { label: 'خرید', className: 'text-emerald-700' };
  return { label: 'معامله', className: 'text-slate-700' };
}

const PERIODS: OrderPeriod[] = ['day', 'week', 'month', 'year'];
const MAX_ROWS = 3;

export function ActiveOrders({
  orders,
  now,
}: {
  orders: ActiveOrderRow[];
  now?: Date;
}) {
  const [period, setPeriod] = useState<OrderPeriod>('day');
  const visible = useMemo(
    () => filterOrdersByPeriod(orders, period, now).slice(0, MAX_ROWS),
    [orders, period, now],
  );

  return (
    <section className="portal-dense-copy rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-800">سفارش‌های فعال</h2>
        <Link href="/portal/orders" className="text-xs text-gold-700 hover:underline">
          مشاهده همه
        </Link>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="بازه سفارش‌ها">
        {PERIODS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            aria-pressed={period === key}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              period === key
                ? 'bg-gold-500 text-white'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100',
            )}
          >
            {ORDER_PERIOD_LABELS[key]}
          </button>
        ))}
      </div>

      {!visible.length ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300" aria-hidden />
          <p className="text-sm text-slate-500">در حال حاضر سفارش باز و معلقی ندارید</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-slate-100">
                  <th className="py-2 font-medium">شماره سفارش</th>
                  <th className="py-2 font-medium">نوع</th>
                  <th className="py-2 font-medium">وزن</th>
                  <th className="py-2 font-medium">قیمت</th>
                  <th className="py-2 font-medium">وضعیت</th>
                  <th className="py-2 font-medium">تاریخ ثبت</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => {
                  const side = sideMeta(order.side);
                  const price = rowPrice(order);
                  return (
                    <tr key={order.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <OrderRef order={order} />
                      </td>
                      <td className={cn('py-3', side.className)}>{side.label}</td>
                      <td className="py-3 tabular-nums">{formatWeight(order.weightGrams)}</td>
                      <td className="py-3 tabular-nums">{formatWholeMoney(price)}</td>
                      <td className="py-3">
                        <StatusBadge
                          status={orderStatusPresentation(order.status).status}
                          label={order.statusLabel ?? orderStatusPresentation(order.status).label}
                        />
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDate(order.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visible.map((order) => {
              const side = sideMeta(order.side);
              const price = rowPrice(order);
              return (
                <li key={order.id}>
                  <OrderCardLink order={order}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium" dir="ltr">
                        {toPersianDigits(order.orderNumber)}
                      </span>
                      <StatusBadge
                        status={orderStatusPresentation(order.status).status}
                        label={order.statusLabel ?? orderStatusPresentation(order.status).label}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span className={side.className}>{side.label}</span>
                      <span className="tabular-nums">{formatWeight(order.weightGrams)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs">
                      <span className="tabular-nums font-medium">{formatWholeMoney(price)}</span>
                      <span className="text-muted-foreground">{formatDate(order.createdAt)}</span>
                    </div>
                  </OrderCardLink>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function OrderRef({ order }: { order: ActiveOrderRow }) {
  const className = 'font-medium';
  if (order.demo) {
    return (
      <span className={className} dir="ltr">
        {toPersianDigits(order.orderNumber)}
      </span>
    );
  }
  return (
    <Link href={`/portal/orders/${order.id}`} className={className} dir="ltr">
      {toPersianDigits(order.orderNumber)}
    </Link>
  );
}

function OrderCardLink({ order, children }: { order: ActiveOrderRow; children: ReactNode }) {
  const className = 'block rounded-xl border border-slate-100 p-3';
  if (order.demo) return <div className={className}>{children}</div>;
  return (
    <Link href={`/portal/orders/${order.id}`} className={className}>
      {children}
    </Link>
  );
}
