'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ordersApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageSpinner } from '@/components/ui/spinner';
import { Alert, EmptyState } from '@/components/ui/alert';
import { StatusBadge } from '@/components/portal/status-badge';
import { OrderRemainingSteps } from '@/components/portal/order-remaining-steps';
import {
  formatRial,
  formatGrams,
  formatDate,
  orderStatusPresentation,
  toPersianDigits,
} from '@/lib/utils';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">سفارش‌های من</h1>
        <Link href="/portal/orders/new">
          <Button>+ ثبت سفارش جدید</Button>
        </Link>
      </div>

      {error && <Alert variant="error">خطا در بارگذاری سفارش‌ها</Alert>}

      {!error && data?.data?.length === 0 ? (
        <EmptyState
          icon="📋"
          message="هنوز سفارشی ندارید"
          description="برای ثبت اولین سفارش روی دکمه بالا کلیک کنید"
        />
      ) : (
        <>
          <div className="space-y-3">
            {data?.data?.map((order) => (
              <Link key={order.id} href={`/portal/orders/${order.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-medium" dir="ltr">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="tabular-nums">{formatGrams(order.weightGrams)}</span>
                        <span className="tabular-nums font-medium">{formatRial(order.totalAmountRial)}</span>
                        <StatusBadge {...orderStatusPresentation(order.status)} />
                      </div>
                    </div>
                    <div className="mt-2">
                      <OrderRemainingSteps status={order.status} compact />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {data?.meta && data.meta.total > 0 ? (
            <OrdersPagination
              page={page}
              total={data.meta.total}
              pageSize={PAGE_SIZE}
              onPage={setPage}
            />
          ) : null}
        </>
      )}
    </div>
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
