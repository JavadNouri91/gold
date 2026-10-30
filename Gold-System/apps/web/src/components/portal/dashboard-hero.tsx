'use client';

import { addDecimal } from '@/lib/decimal-string';
import { readAvailableCredit } from '@/lib/credit-view';
import { isRegisteredHolding, type PortfolioPosition } from '@/lib/customer-portfolio';
import type { CustomerAccount } from '@/lib/api';
import { cn, formatWholeMoney, toPersianDigits } from '@/lib/utils';

export function netWorthRial(
  account?: CustomerAccount | null,
  position?: PortfolioPosition | null,
): string | null {
  const cash = account ? readAvailableCredit(account) : null;
  const gold = position != null && isRegisteredHolding(position) ? position.marketValueRial : null;
  if (cash && gold) return addDecimal(cash, gold);
  return cash ?? gold ?? null;
}

export function DashboardHero({
  account,
  position,
}: {
  account?: CustomerAccount | null;
  position?: PortfolioPosition | null;
}) {
  const total = netWorthRial(account, position);
  const change = position != null && isRegisteredHolding(position) ? position.changePercent : null;
  const pnl = parsePnl(change);

  return (
    <section className="flex min-h-24 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
      <PnlBadge pnl={pnl} />
      <div className="min-w-0 text-start">
        <p className="truncate text-xl font-bold tabular-nums text-slate-900 sm:text-2xl">
          {formatWholeMoney(total)}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-slate-500 sm:text-xs">
          کل دارایی‌ها (ریالی + ارزش طلا)
        </p>
      </div>
    </section>
  );
}

function parsePnl(changePercent: string | null | undefined): { text: string; up: boolean } | null {
  if (changePercent == null || changePercent.trim() === '') return null;
  const n = Number(changePercent);
  if (!Number.isFinite(n) || n === 0) return null;
  const up = n > 0;
  const abs = Math.abs(n).toFixed(1).replace(/\.0$/, '');
  return {
    up,
    text: `${up ? '+' : '−'}${toPersianDigits(abs)}٪`,
  };
}

function PnlBadge({ pnl }: { pnl: { text: string; up: boolean } | null }) {
  if (!pnl) {
    return (
      <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
        سود امروز: —
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
        pnl.up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
      )}
    >
      سود امروز: {pnl.text}
    </span>
  );
}
