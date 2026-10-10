import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import type { ActivityTransaction } from '@/lib/api';
import { SideBadge, TransactionStatus } from '@/components/portal/trades/activity-transactions';
import { formatRial, formatWeight } from '@/lib/utils';
import { AssetSkeleton, CardHeading, assetCardClass } from './assets-ui';

export function RecentGoldTransactions({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: ActivityTransaction[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section aria-labelledby="recent-trades-title" className={assetCardClass}>
      <div className="flex items-center justify-between gap-3">
        <CardHeading id="recent-trades-title" title="آخرین معاملات" icon={Clock3} />
        <Link href="/portal/trades" className="inline-flex min-h-11 shrink-0 items-center text-xs font-semibold text-[#C8922E]">
          مشاهده همه
        </Link>
      </div>

      {loading ? (
        <AssetSkeleton className="mt-4 h-28 w-full" />
      ) : error ? (
        <div className="mt-4">
          <p className="text-sm text-[#202124]">اطلاعات معاملات در حال حاضر قابل دریافت نیست.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]"
          >
            تلاش مجدد
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <p className="text-sm leading-7 text-[#202124]">هنوز معامله‌ای ثبت نشده است.</p>
          <Link href="/portal/orders/new" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-[#C8922E]">
            شروع معامله
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/portal/orders/${row.id}`} className="block rounded-xl border border-[#E5E7EB] px-3 py-3">
                  <TransactionBody row={row} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[36rem] text-right text-sm">
              <thead className="text-xs text-[#6B7280]">
                <tr className="border-b border-[#E5E7EB]">
                  <th className="px-2 py-2 font-medium">تاریخ</th>
                  <th className="px-2 py-2 font-medium">نوع</th>
                  <th className="px-2 py-2 font-medium">وزن</th>
                  <th className="px-2 py-2 font-medium">قیمت هر گرم</th>
                  <th className="px-2 py-2 font-medium">مبلغ کل</th>
                  <th className="px-2 py-2 font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#F3F4F6] last:border-0">
                    <td className="px-2 py-3">
                      <Link href={`/portal/orders/${row.id}`} className="font-medium text-[#202124]">
                        {shortDate(row.confirmedAt ?? row.createdAt)}
                      </Link>
                    </td>
                    <td className="px-2 py-3">
                      <SideBadge side={row.side} />
                    </td>
                    <td className="px-2 py-3 tabular-nums">{formatWeight(row.weightGrams)}</td>
                    <td className="px-2 py-3 tabular-nums">{formatRial(row.unitPriceRial)}</td>
                    <td className="px-2 py-3 font-semibold tabular-nums">{formatRial(row.totalAmountRial)}</td>
                    <td className="px-2 py-3">
                      <TransactionStatus status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function TransactionBody({ row }: { row: ActivityTransaction }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <SideBadge side={row.side} />
        <TransactionStatus status={row.status} />
      </div>
      <p className="mt-2 text-xs text-[#6B7280]">{shortDate(row.confirmedAt ?? row.createdAt)}</p>
      <p className="mt-2 text-sm font-semibold tabular-nums">{formatWeight(row.weightGrams)}</p>
      <p className="mt-1 text-xs tabular-nums text-[#6B7280]">{formatRial(row.unitPriceRial)} / گرم</p>
      <p className="mt-1 text-sm font-bold tabular-nums">{formatRial(row.totalAmountRial)}</p>
    </>
  );
}

function shortDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fa-IR');
}
