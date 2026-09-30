import type { CreditLedgerEntry } from '@/lib/api';
import type { CreditOrderRow } from '@/lib/credit-view';
import { formatDateTime } from '@/lib/utils';
import { orderNumberForEntry, presentCreditHistory } from '@/lib/credit-view';
import { CreditRetry, CreditSection, CreditSkeleton, formatCreditMoney, signedCreditMoney } from './credit-ui';

export function CreditHistory({
  entries,
  orders,
  loading,
  error,
  onRetry,
  className,
}: {
  entries: CreditLedgerEntry[];
  orders: CreditOrderRow[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  className?: string;
}) {
  const rows = entries.slice(0, 8).map((entry) => presentCreditHistory(entry, orderNumberForEntry(entry, orders)));
  return (
    <CreditSection title="تاریخچه تغییرات اعتبار" id="credit-history-title" className={className}>
      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <CreditSkeleton className="h-20 w-full" />
          <CreditSkeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <CreditRetry message="تاریخچه اعتبار در حال حاضر قابل دریافت نیست." onRetry={onRetry} />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-4 text-sm leading-7 text-[#202124]">
          هنوز تغییری در اعتبار حساب ثبت نشده است.
        </p>
      ) : (
        <>
          <ol className="mt-4 space-y-4 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="relative border-r-2 border-[#E5E7EB] pr-4">
                <span className="absolute -right-[5px] top-1.5 h-2 w-2 rounded-full bg-[#C8922E]" aria-hidden />
                <HistoryBody row={row} />
              </li>
            ))}
          </ol>
          <div className="mt-4 hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-[#6B7280]">
                  <th className="px-2 py-3 text-right font-medium">تاریخ</th>
                  <th className="px-2 py-3 text-right font-medium">نوع</th>
                  <th className="px-2 py-3 text-right font-medium">مبلغ</th>
                  <th className="px-2 py-3 text-right font-medium">شرح</th>
                  <th className="px-2 py-3 text-right font-medium">مانده</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#E5E7EB] last:border-0">
                    <td className="px-2 py-3 text-[#6B7280]">{formatDateTime(row.createdAt)}</td>
                    <td className="px-2 py-3 font-semibold text-[#202124]">{row.title}</td>
                    <td className={`px-2 py-3 font-semibold tabular-nums ${toneClass(row.tone)}`}>
                      {signedCreditMoney(row.amount, row.tone)}
                    </td>
                    <td className="px-2 py-3 text-[#202124]">{row.description}</td>
                    <td className="px-2 py-3 tabular-nums text-[#202124]">
                      {row.balanceCaption}: {formatCreditMoney(row.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CreditSection>
  );
}

function HistoryBody({
  row,
}: {
  row: ReturnType<typeof presentCreditHistory>;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-[#202124]">{row.title}</p>
        <p className="text-[11px] text-[#6B7280]">{formatDateTime(row.createdAt)}</p>
      </div>
      <p className={`mt-1 text-sm font-bold tabular-nums ${toneClass(row.tone)}`}>
        {signedCreditMoney(row.amount, row.tone)}
      </p>
      <p className="mt-1 text-sm leading-6 text-[#202124]">{row.description}</p>
      <p className="mt-1 text-xs text-[#6B7280]">
        {row.balanceCaption}: <span className="font-semibold tabular-nums text-[#202124]">{formatCreditMoney(row.balance)}</span>
      </p>
    </div>
  );
}

function toneClass(tone: 'plus' | 'minus' | 'neutral'): string {
  if (tone === 'plus') return 'text-[#16A34A]';
  if (tone === 'minus') return 'text-[#DC2626]';
  return 'text-[#6B7280]';
}
