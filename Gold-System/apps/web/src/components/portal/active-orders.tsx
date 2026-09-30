'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Order } from '@/lib/api';
import { StatusBadge } from '@/components/portal/status-badge';
import { ORDER_STATUS_LABELS, cn, formatDate, formatRial, formatWeight } from '@/lib/utils';
import type { DemoOrderRow, DemoSide } from '@/lib/portal-demo';

export type ActiveOrderRow = (Order & { side?: DemoSide; unitPriceRial?: string; statusLabel?: string; demo?: boolean }) | DemoOrderRow;

function rowPrice(order: ActiveOrderRow): string {
  if ('totalAmountRial' in order) return order.totalAmountRial;
  return order.unitPriceRial;
}

function sideMeta(side?: DemoSide) {
  const isSell = side === 'SELL';
  return {
    label: isSell ? 'فروش' : 'خرید',
    className: isSell ? 'text-red-700' : 'text-emerald-700',
  };
}

export function ActiveOrders({ orders }: { orders: ActiveOrderRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-800">سفارش‌های فعال من</h2>
        <Link href="/portal/orders" className="text-xs text-gold-700 hover:underline">
          مشاهده همه
        </Link>
      </div>

      {!orders.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">سفارش فعالی ندارید</p>
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
                {orders.map((order) => {
                  const side = sideMeta(order.side);
                  const price = rowPrice(order);
                  return (
                    <tr key={order.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <OrderRef order={order} />
                      </td>
                      <td className={cn('py-3', side.className)}>{side.label}</td>
                      <td className="py-3 tabular-nums">{formatWeight(order.weightGrams)}</td>
                      <td className="py-3 tabular-nums">{formatRial(price)}</td>
                      <td className="py-3">
                        <StatusBadge
                          status={order.status}
                          label={order.statusLabel ?? ORDER_STATUS_LABELS[order.status] ?? order.status}
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
            {orders.map((order) => {
              const side = sideMeta(order.side);
              const price = rowPrice(order);
              return (
                <li key={order.id}>
                  <OrderCardLink order={order}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium" dir="ltr">
                        {order.orderNumber}
                      </span>
                      <StatusBadge
                        status={order.status}
                        label={order.statusLabel ?? ORDER_STATUS_LABELS[order.status] ?? order.status}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span className={side.className}>{side.label}</span>
                      <span className="tabular-nums">{formatWeight(order.weightGrams)}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-xs">
                      <span className="tabular-nums font-medium">{formatRial(price)}</span>
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
        {order.orderNumber}
      </span>
    );
  }
  return (
    <Link href={`/portal/orders/${order.id}`} className={className} dir="ltr">
      {order.orderNumber}
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
