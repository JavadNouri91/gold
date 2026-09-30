import Link from 'next/link';
import type { Trade } from '@/lib/api';
import { StatusBadge } from '@/components/portal/status-badge';
import { TRADE_STATUS_LABELS, cn, formatDate, formatRial, formatWeight } from '@/lib/utils';
import { AssetSkeleton, assetCardClass } from './assets-ui';

type TradeSide = 'BUY' | 'SELL';

export type AssetTradeRow = Pick<
  Trade,
  'id' | 'tradeNumber' | 'weightGrams' | 'unitPriceRial' | 'totalAmountRial' | 'status' | 'createdAt'
> & { side?: TradeSide };

export function RecentGoldTransactions({
  trades,
  loading,
  error,
  onRetry,
}: {
  trades: AssetTradeRow[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section aria-labelledby="recent-trades-title" className={assetCardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-trades-title" className="text-base font-bold text-[#202124]">
          آخرین معاملات طلا
        </h2>
        <Link href="/portal/trades" className="inline-flex min-h-11 items-center text-xs font-semibold text-[#C8922E]">
          مشاهده همه
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <AssetSkeleton className="h-24 w-full" />
          <AssetSkeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className="mt-4 rounded-xl bg-red-50 px-3 py-4">
          <p className="text-sm text-[#202124]">اطلاعات معاملات در حال حاضر قابل دریافت نیست.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[#E5E7EB] bg-white px-4 text-sm font-semibold"
          >
            تلاش مجدد
          </button>
        </div>
      ) : trades.length === 0 ? (
        <div className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-4">
          <p className="text-sm leading-7 text-[#202124]">هنوز معامله‌ای ثبت نشده است.</p>
          <Link
            href="/portal/orders/new"
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] px-4 text-sm font-semibold text-white"
          >
            شروع معامله
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {trades.map((trade) => (
            <li key={trade.id}>
              <TradeCard trade={trade} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TradeCard({ trade }: { trade: AssetTradeRow }) {
  const tone = tradeTone(trade);
  return (
    <Link
      href={`/portal/trades/${trade.id}`}
      className="block rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-sm font-bold', tone.className)}>{tone.label}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-[#202124]">{formatWeight(trade.weightGrams)}</p>
        </div>
        <StatusBadge status={trade.status} label={TRADE_STATUS_LABELS[trade.status] ?? trade.status} />
      </div>
      <p className="mt-2 text-xs tabular-nums text-[#6B7280]">{formatRial(trade.unitPriceRial)} / گرم</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p className="text-sm font-bold tabular-nums text-[#202124]">{formatRial(trade.totalAmountRial)}</p>
        <p className="text-xs text-[#6B7280]">{formatDate(trade.createdAt)}</p>
      </div>
    </Link>
  );
}

function tradeTone(trade: AssetTradeRow): { label: string; className: string } {
  if (trade.side === 'SELL') return { label: 'فروش', className: 'text-[#DC2626]' };
  if (trade.side === 'BUY') return { label: 'خرید', className: 'text-[#16A34A]' };
  if (trade.status === 'SETTLING' || trade.status === 'PENDING_CONFIRMATION') {
    return { label: 'در انتظار', className: 'text-[#A16207]' };
  }
  if (trade.status === 'REJECTED' || trade.status === 'CANCELLED' || trade.status === 'REVERSED') {
    return { label: 'ناموفق', className: 'text-[#DC2626]' };
  }
  return { label: 'معامله', className: 'text-[#1D4ED8]' };
}
