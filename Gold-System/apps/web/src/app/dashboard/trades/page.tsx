'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalTradesApi, tradesFromList, type StaffTrade } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { TradeFilterBar, EMPTY_TRADE_FILTERS, type TradeFilterValues } from '@/components/dashboard/trade-filter-bar';
import { TradeHeroCards } from '@/components/dashboard/trading-management/trade-hero-cards';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { TradeDetailsModal } from '@/components/dashboard/trade-details-modal';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { SideBadge } from '@/components/ui/side-badge';
import {
  TRADE_STATUS_LABELS,
  formatDateTime,
  formatFaNumber,
  formatWeight,
  formatWholeMoney,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export default function TradesPage() {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.read', 'trade.approve']);
  const [applied, setApplied] = useState<TradeFilterValues>(EMPTY_TRADE_FILTERS);
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ tradeId: string; autoPrint: boolean } | null>(null);
  const { data, error, isLoading, mutate } = useSWR(
    allowed ? ['trades', applied, page] : null,
    () =>
      internalTradesApi.list({
        status: applied.status || undefined,
        side: applied.side || undefined,
        q: applied.q.trim() || undefined,
        from: applied.from || undefined,
        to: applied.to || undefined,
        page,
        limit: 20,
      }),
  );
  const { data: summary, isLoading: summaryLoading } = useSWR(
    allowed ? 'trade-summary' : null,
    () => internalTradesApi.summary(),
  );
  const rows = tradesFromList(data);

  if (!allowed) return <ForbiddenNotice permission="trade.read" />;

  const columns: Column<StaffTrade>[] = [
    {
      key: 'number',
      header: 'شماره',
      render: (row) => (
        <Link href={`/dashboard/trades/${row.id}`} className="font-medium text-gold-800" dir="ltr">
          {toPersianDigits(row.tradeNumber)}
        </Link>
      ),
    },
    {
      key: 'side',
      header: 'نوع معامله',
      render: (row) => <SideBadge side={row.side} showIcon />,
    },
    {
      key: 'customer',
      header: 'مشتری',
      render: (row) => (
        <Link href={`/dashboard/customers/${row.customerId}`} className="font-medium">
          {row.customerName?.trim() || 'مشاهده پرونده مشتری'}
        </Link>
      ),
    },
    {
      key: 'order',
      header: 'سفارش',
      render: (row) => (
        <Link href={`/dashboard/orders/${row.orderId}`} className="text-gold-800" dir="ltr">
          {row.orderNumber ? toPersianDigits(row.orderNumber) : 'سفارش'}
        </Link>
      ),
    },
    { key: 'amount', header: 'مبلغ', render: (row) => formatWholeMoney(row.totalAmountRial) },
    { key: 'weight', header: 'وزن', render: (row) => formatWeight(row.weightGrams) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(TRADE_STATUS_LABELS, row.status)} />,
    },
    { key: 'date', header: 'تأیید', render: (row) => formatDateTime(row.confirmedAt) },
    {
      key: 'actions',
      header: 'عملیات',
      className: 'whitespace-nowrap',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={`مشاهده معامله ${row.tradeNumber}`}
            onClick={() => setDialog({ tradeId: row.id, autoPrint: false })}
          >
            نمایش
          </Button>
          <Button
            size="sm"
            className="gap-1"
            aria-label={`چاپ معامله ${row.tradeNumber}`}
            onClick={() => setDialog({ tradeId: row.id, autoPrint: true })}
          >
            <Printer className="h-3.5 w-3.5" aria-hidden />
            چاپ
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="معاملات" description="تأیید دوم و آستانه مبلغ در این صفحه محاسبه نمی‌شود." />
      <TradeHeroCards summary={summary} isLoading={summaryLoading} />
      <TradeFilterBar
        value={applied}
        onChange={(values) => {
          setApplied(values);
          setPage(1);
        }}
        onReset={() => {
          setApplied(EMPTY_TRADE_FILTERS);
          setPage(1);
        }}
      />
      <p className="text-sm text-muted-foreground">
        {formatFaNumber(data?.total ?? 0)} معامله
      </p>
      {error ? <ApiErrorState error={error} onRetry={() => void mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={isLoading}
        page={data?.page}
        totalPages={data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1}
        onPageChange={setPage}
      />
      <TradeDetailsModal
        tradeId={dialog?.tradeId ?? null}
        open={Boolean(dialog)}
        autoPrint={dialog?.autoPrint ?? false}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
