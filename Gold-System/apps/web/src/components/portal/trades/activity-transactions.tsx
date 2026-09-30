import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircle2, ChevronLeft, Clock3, XCircle } from 'lucide-react';
import type { ActivityTransaction } from '@/lib/api';
import {
  ORDER_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  cn,
  formatMoney,
  formatPurity,
  formatWeight,
  toPersianDigits,
} from '@/lib/utils';

export function transactionStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? TRADE_STATUS_LABELS[status] ?? status;
}

function statusTone(status: string): { className: string; Icon: typeof CheckCircle2 } {
  if (['COMPLETED'].includes(status)) {
    return { className: 'bg-green-50 text-[#16A34A]', Icon: CheckCircle2 };
  }
  if (['APPROVED', 'CONFIRMED', 'TRADE_CREATED'].includes(status)) {
    return { className: 'bg-blue-50 text-[#2563EB]', Icon: CheckCircle2 };
  }
  if (['CANCELLED', 'REJECTED', 'REVERSED', 'FAILED'].includes(status)) {
    return { className: 'bg-red-50 text-[#DC2626]', Icon: XCircle };
  }
  if (['EXPIRED'].includes(status)) {
    return { className: 'bg-slate-100 text-[#6B7280]', Icon: XCircle };
  }
  return { className: 'bg-amber-50 text-[#D97706]', Icon: Clock3 };
}

export function TransactionStatus({ status }: { status: string }) {
  const tone = statusTone(status);
  const Icon = tone.Icon;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', tone.className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {transactionStatusLabel(status)}
    </span>
  );
}

export function SideBadge({ side }: { side: ActivityTransaction['side'] }) {
  if (side === 'BUY') {
    return <span className="text-sm font-bold text-[#16A34A]">خرید</span>;
  }
  if (side === 'SELL') {
    return <span className="text-sm font-bold text-[#DC2626]">فروش</span>;
  }
  return <span className="text-sm font-bold text-[#2563EB]">معامله</span>;
}

function stamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('fa-IR');
  const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `${day} - ${time}`;
}

export function TransactionCards({ rows }: { rows: ActivityTransaction[] }) {
  return (
    <ul className="space-y-3 lg:hidden">
      {rows.map((row) => (
        <li key={row.id}>
          <article
            className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm',
              row.side === 'SELL' ? 'border-red-100' : row.side === 'BUY' ? 'border-green-100' : 'border-[#E5E7EB]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <SideBadge side={row.side} />
              <TransactionStatus status={row.status} />
            </div>
            <p className="mt-2 font-semibold tabular-nums text-[#202124]" dir="ltr">
              {row.orderNumber}
            </p>
            <p className="mt-3 text-base font-bold tabular-nums text-[#202124]">{formatWeight(row.weightGrams)}</p>
            <p className="text-sm text-[#6B7280]">عیار {formatPurity(row.purityRatio)}</p>
            <p className="mt-3 text-xs text-[#6B7280]">مبلغ</p>
            <p className="text-base font-bold tabular-nums text-[#202124]">{formatMoney(row.totalAmountRial)}</p>
            <p className="mt-3 text-xs text-[#6B7280]">{stamp(row.createdAt)}</p>
            <Link
              href={`/portal/orders/${row.id}`}
              className="mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-xl bg-[#F8F9FA] px-3 text-sm font-semibold text-[#202124]"
            >
              مشاهده جزئیات
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function TransactionTable({ rows }: { rows: ActivityTransaction[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm lg:block">
      <table className="w-full text-sm">
        <thead className="bg-[#F8F9FA] text-[#6B7280]">
          <tr>
            {['شماره سفارش', 'تاریخ و ساعت', 'نوع', 'مقدار', 'عیار', 'قیمت واحد', 'مبلغ کل', 'وضعیت', 'عملیات'].map(
              (heading) => (
                <th key={heading} scope="col" className="px-3 py-3 text-right font-medium">
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#E5E7EB]">
              <td className="px-3 py-4 font-semibold tabular-nums" dir="ltr">
                {row.orderNumber}
              </td>
              <td className="px-3 py-4 whitespace-nowrap text-[#6B7280]">{stamp(row.createdAt)}</td>
              <td className="px-3 py-4">
                <SideBadge side={row.side} />
              </td>
              <td className="px-3 py-4 tabular-nums">{formatWeight(row.weightGrams)}</td>
              <td className="px-3 py-4">{formatPurity(row.purityRatio)}</td>
              <td className="px-3 py-4 tabular-nums">{formatMoney(row.unitPriceRial)}</td>
              <td className="px-3 py-4 font-semibold tabular-nums">{formatMoney(row.totalAmountRial)}</td>
              <td className="px-3 py-4">
                <TransactionStatus status={row.status} />
              </td>
              <td className="px-3 py-4">
                <Link
                  href={`/portal/orders/${row.id}`}
                  className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#C8922E]"
                >
                  جزئیات
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ActivityPagination({
  page,
  limit,
  total,
  onPage,
  onLimit,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (page: number) => void;
  onLimit: (limit: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  const pages = pageWindow(page, totalPages);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#6B7280]">
        نمایش {toPersianDigits(String(from))} تا {toPersianDigits(String(to))} از {toPersianDigits(String(total))} معامله
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[#6B7280]">
          نمایش در هر صفحه
          <select
            aria-label="تعداد در هر صفحه"
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
            className="min-h-11 rounded-xl border border-[#E5E7EB] bg-white px-2 text-sm text-[#202124]"
          >
            {[10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {toPersianDigits(String(size))}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2 lg:hidden">
          <button
            type="button"
            className="min-h-11 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            قبلی
          </button>
          <button
            type="button"
            className="min-h-11 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            مشاهده معاملات بیشتر
          </button>
        </div>
        <div className="hidden items-center gap-1 lg:flex">
          <PageButton label="صفحه قبل" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ‹
          </PageButton>
          {pages.map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-[#6B7280]">
                …
              </span>
            ) : (
              <PageButton key={item} label={`صفحه ${item}`} pressed={item === page} onClick={() => onPage(item)}>
                {toPersianDigits(String(item))}
              </PageButton>
            ),
          )}
          <PageButton label="صفحه بعد" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            ›
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  children,
  label,
  pressed,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={pressed ? 'page' : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'min-h-11 min-w-11 rounded-xl border px-2 text-sm',
        pressed ? 'border-[#C8922E] bg-[#C8922E] text-white' : 'border-[#E5E7EB] bg-white text-[#202124]',
        disabled && 'opacity-40',
      )}
    >
      {children}
    </button>
  );
}

function pageWindow(page: number, total: number): Array<number | '…'> {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const items: Array<number | '…'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) items.push('…');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < total - 1) items.push('…');
  items.push(total);
  return items;
}
