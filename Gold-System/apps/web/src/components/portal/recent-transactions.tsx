'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Trade } from '@/lib/api';
import { StatusBadge } from '@/components/portal/status-badge';
import { TRADE_STATUS_LABELS, cn, formatDate, formatWholeMoney, formatWeight } from '@/lib/utils';
import {
  ORDER_PERIOD_LABELS,
  filterOrdersByPeriod,
  type OrderPeriod,
} from '@/lib/order-period';
import type { DemoSide, DemoTradeRow } from '@/lib/portal-demo';

export type RecentTradeRow = (Trade & { side?: DemoSide; statusLabel?: string; demo?: boolean }) | DemoTradeRow;

function sideMeta(side?: DemoSide | null) {
  if (side === 'SELL') return { label: 'فروش', className: 'text-red-700' };
  if (side === 'BUY') return { label: 'خرید', className: 'text-emerald-700' };
  return { label: 'معامله', className: 'text-slate-700' };
}

const PERIODS: OrderPeriod[] = ['day', 'week', 'month', 'year'];
const MAX_ROWS = 10;

export function RecentTransactions({
  trades,
  now,
}: {
  trades: RecentTradeRow[];
  now?: Date;
}) {
  const [period, setPeriod] = useState<OrderPeriod>('day');
  const visible = useMemo(
    () => filterOrdersByPeriod(trades, period, now).slice(0, MAX_ROWS),
    [trades, period, now],
  );

  return (
    <section className="portal-dense-copy rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-800">آخرین معاملات</h2>
        <Link href="/portal/trades" className="text-xs text-gold-700 hover:underline">
          مشاهده همه
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="بازه معاملات">
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
        <p className="py-6 text-center text-sm text-muted-foreground">
          {period === 'day' ? 'معامله‌ای برای امروز ندارید' : 'معامله‌ای در این بازه ندارید'}
        </p>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-right text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-slate-100">
                  <th className="py-2 font-medium">شماره معامله</th>
                  <th className="py-2 font-medium">نوع</th>
                  <th className="py-2 font-medium">وزن</th>
                  <th className="py-2 font-medium">قیمت هر گرم</th>
                  <th className="py-2 font-medium">مبلغ کل</th>
                  <th className="py-2 font-medium">وضعیت</th>
                  <th className="py-2 font-medium">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((trade) => {
                  const side = sideMeta(trade.side);
                  return (
                    <tr key={trade.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <TradeRef trade={trade} />
                      </td>
                      <td className={cn('py-3', side.className)}>{side.label}</td>
                      <td className="py-3 tabular-nums">{formatWeight(trade.weightGrams)}</td>
                      <td className="py-3 tabular-nums">{formatWholeMoney(trade.unitPriceRial)}</td>
                      <td className="py-3 tabular-nums">{formatWholeMoney(trade.totalAmountRial)}</td>
                      <td className="py-3">
                        <StatusBadge
                          status={trade.status}
                          label={trade.statusLabel ?? TRADE_STATUS_LABELS[trade.status] ?? trade.status}
                        />
                      </td>
                      <td className="py-3 text-muted-foreground">{formatDate(trade.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visible.map((trade) => {
              const side = sideMeta(trade.side);
              return (
                <li key={trade.id}>
                  <TradeCardLink trade={trade}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium" dir="ltr">
                        {trade.tradeNumber}
                      </span>
                      <StatusBadge
                        status={trade.status}
                        label={trade.statusLabel ?? TRADE_STATUS_LABELS[trade.status] ?? trade.status}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>
                        <span className={side.className}>{side.label}</span>
                        {' · '}
                        {formatWeight(trade.weightGrams)}
                      </span>
                      <span>{formatDate(trade.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{formatWholeMoney(trade.totalAmountRial)}</p>
                  </TradeCardLink>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function TradeRef({ trade }: { trade: RecentTradeRow }) {
  const className = 'font-medium';
  if (trade.demo) {
    return (
      <span className={className} dir="ltr">
        {trade.tradeNumber}
      </span>
    );
  }
  return (
    <Link href={`/portal/trades/${trade.id}`} className={className} dir="ltr">
      {trade.tradeNumber}
    </Link>
  );
}

function TradeCardLink({ trade, children }: { trade: RecentTradeRow; children: ReactNode }) {
  const className = 'block rounded-xl border border-slate-100 p-3';
  if (trade.demo) return <div className={className}>{children}</div>;
  return (
    <Link href={`/portal/trades/${trade.id}`} className={className}>
      {children}
    </Link>
  );
}
