'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import useSWR from 'swr';
import type { Order } from '@/lib/api';
import { ordersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert, EmptyState } from '@/components/ui/alert';
import { OrderTimeline } from '@/components/portal/order-remaining-steps';
import { SideBadge, TransactionStatus } from '@/components/portal/trades/activity-transactions';
import { cn, formatMoney, formatPurity, formatWeight, toPersianDigits } from '@/lib/utils';

const PAGE_SIZE = 10;

function pageWindow(page: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const items: Array<number | '…'> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push('…');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < totalPages - 1) items.push('…');
  items.push(totalPages);
  return items;
}

export default function OrdersPage() {
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useSWR(
    ['portal-orders', page],
    () => ordersApi.list({ limit: PAGE_SIZE, page }),
    { keepPreviousData: true },
  );

  if (isLoading && !data) return <PageSpinner />;

  const rows = data?.data ?? [];

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-4 overflow-x-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#202124]">سفارش‌های من</h1>
          <p className="mt-1 text-sm text-[#6B7280]">مشاهده و پیگیری سفارش‌های خرید و فروش</p>
        </div>
        <Link href="/portal/orders/new">
          <Button>+ ثبت سفارش جدید</Button>
        </Link>
      </header>

      {error && <Alert variant="error">خطا در بارگذاری سفارش‌ها</Alert>}

      {!error && rows.length === 0 ? (
        <EmptyState
          icon="📋"
          message="هنوز سفارشی ندارید"
          description="برای ثبت اولین سفارش روی دکمه بالا کلیک کنید"
        />
      ) : rows.length > 0 ? (
        <>
          <h2 className="text-base font-bold text-[#202124]">سفارش‌ها</h2>
          <OrderCards rows={rows} />
          <OrderTable rows={rows} />

          {data?.meta && data.meta.total > 0 ? (
            <OrdersPagination
              page={page}
              total={data.meta.total}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const ORDER_COLUMNS = [
  'شماره سفارش',
  'تاریخ و ساعت',
  'نوع',
  'مقدار',
  'عیار',
  'قیمت واحد',
  'مبلغ کل',
  'وضعیت',
  'عملیات',
] as const;

function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('fa-IR');
  const time = date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `${day} - ${time}`;
}

function OrderCards({ rows }: { rows: Order[] }) {
  return (
    <ul className="space-y-3 lg:hidden">
      {rows.map((order) => (
        <li key={order.id}>
          <article
            className={cn(
              'rounded-2xl border bg-white p-4 shadow-sm',
              order.side === 'SELL' ? 'border-red-100' : order.side === 'BUY' ? 'border-green-100' : 'border-[#E5E7EB]',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <SideBadge side={order.side ?? null} />
              <TransactionStatus status={order.status} />
            </div>
            <p className="mt-2 font-semibold tabular-nums text-[#202124]" dir="ltr">
              {toPersianDigits(order.orderNumber)}
            </p>
            <p className="mt-3 text-base font-bold tabular-nums text-[#202124]">{formatWeight(order.weightGrams)}</p>
            <p className="text-sm text-[#6B7280]">عیار {formatPurity(order.purityRatio)}</p>
            <p className="mt-3 text-xs text-[#6B7280]">قیمت واحد</p>
            <p className="text-sm font-semibold tabular-nums text-[#202124]">{formatMoney(order.unitPriceRial)}</p>
            <p className="mt-3 text-xs text-[#6B7280]">مبلغ کل</p>
            <p className="text-base font-bold tabular-nums text-[#202124]">{formatMoney(order.totalAmountRial)}</p>
            <p className="mt-3 text-xs text-[#6B7280]">{stamp(order.createdAt)}</p>
            <OrderTimeline status={order.status} className="mt-4" />
            <Link
              href={`/portal/orders/${order.id}`}
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

function OrderTable({ rows }: { rows: Order[] }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm lg:block">
      <table className="w-full text-sm">
        <thead className="bg-[#F8F9FA] text-[#6B7280]">
          <tr>
            {ORDER_COLUMNS.map((heading) => (
              <th key={heading} scope="col" className="px-3 py-3 text-right font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((order) => (
            <OrderTableRow key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderTableRow({ order }: { order: Order }) {
  return (
    <>
      <tr className="border-t border-[#E5E7EB]">
        <td className="px-3 py-4 font-semibold tabular-nums" dir="ltr">
          {toPersianDigits(order.orderNumber)}
        </td>
        <td className="whitespace-nowrap px-3 py-4 text-[#6B7280]">{stamp(order.createdAt)}</td>
        <td className="px-3 py-4">
          <SideBadge side={order.side ?? null} />
        </td>
        <td className="px-3 py-4 tabular-nums">{formatWeight(order.weightGrams)}</td>
        <td className="px-3 py-4">{formatPurity(order.purityRatio)}</td>
        <td className="px-3 py-4 tabular-nums">{formatMoney(order.unitPriceRial)}</td>
        <td className="px-3 py-4 font-semibold tabular-nums">{formatMoney(order.totalAmountRial)}</td>
        <td className="px-3 py-4">
          <TransactionStatus status={order.status} />
        </td>
        <td className="px-3 py-4">
          <Link
            href={`/portal/orders/${order.id}`}
            className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-[#C8922E]"
          >
            جزئیات
          </Link>
        </td>
      </tr>
      <tr>
        <td colSpan={ORDER_COLUMNS.length} className="bg-[#FCFCFD] px-3 pb-4 pt-0">
          <OrderTimeline status={order.status} />
        </td>
      </tr>
    </>
  );
}

function OrdersPagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        نمایش {toPersianDigits(String(from))} تا {toPersianDigits(String(to))} از {toPersianDigits(String(total))} سفارش
      </p>
      {totalPages > 1 ? (
        <nav aria-label="صفحه‌بندی سفارش‌ها" className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            صفحه قبل
          </Button>
          {pageWindow(page, totalPages).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === page ? 'default' : 'outline'}
                size="sm"
                className="min-w-8 px-2 tabular-nums"
                aria-label={`صفحه ${toPersianDigits(String(item))}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
              >
                {toPersianDigits(String(item))}
              </Button>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            صفحه بعد
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
