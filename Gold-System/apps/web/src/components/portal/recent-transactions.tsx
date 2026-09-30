'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Trade } from '@/lib/api';
import { StatusBadge } from '@/components/portal/status-badge';
import { TRADE_STATUS_LABELS, cn, formatDate, formatRial, formatWeight } from '@/lib/utils';
import type { DemoSide, DemoTradeRow } from '@/lib/portal-demo';

export type RecentTradeRow = (Trade & { side?: DemoSide; statusLabel?: string; demo?: boolean }) | DemoTradeRow;

function sideMeta(side?: DemoSide) {
  const isSell = side === 'SELL';
  return {
    label: isSell ? 'فروش' : 'خرید',
    className: isSell ? 'text-red-700' : 'text-emerald-700',
  };
}

export function RecentTransactions({ trades }: { trades: RecentTradeRow[] }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-slate-800">آخرین معاملات</h2>
        <Link href="/portal/trades" className="text-xs text-gold-700 hover:underline">
          مشاهده همه
        </Link>
      </div>

      {!trades.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">هنوز معامله‌ای ثبت نشده</p>
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
                {trades.map((trade) => {
                  const side = sideMeta(trade.side);
                  return (
                    <tr key={trade.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-3">
                        <TradeRef trade={trade} />
                      </td>
                      <td className={cn('py-3', side.className)}>{side.label}</td>
                      <td className="py-3 tabular-nums">{formatWeight(trade.weightGrams)}</td>
                      <td className="py-3 tabular-nums">{formatRial(trade.unitPriceRial)}</td>
                      <td className="py-3 tabular-nums">{formatRial(trade.totalAmountRial)}</td>
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
            {trades.map((trade) => {
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
                    <p className="mt-1 text-sm font-semibold tabular-nums">{formatRial(trade.totalAmountRial)}</p>
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
