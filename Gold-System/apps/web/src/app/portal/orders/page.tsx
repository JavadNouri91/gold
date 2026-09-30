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
import {
  formatRial,
  formatGrams,
  formatDate,
  ORDER_STATUS_LABELS,
} from '@/lib/utils';

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const [offset, setOffset] = useState(0);

  const { data, error, isLoading } = useSWR(
    `orders?offset=${offset}`,
    () => ordersApi.list({ limit: PAGE_SIZE, offset }),
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
                        <StatusBadge
                          status={order.status}
                          label={ORDER_STATUS_LABELS[order.status] ?? order.status}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data?.meta && data.meta.total > PAGE_SIZE && (
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                صفحه قبل
              </Button>
              <span className="text-sm text-muted-foreground self-center">
                {Math.floor(offset / PAGE_SIZE) + 1} از {Math.ceil(data.meta.total / PAGE_SIZE)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= data.meta.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                صفحه بعد
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
