'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalSettlementsApi, reportsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { SettlementSummary } from '@/components/dashboard/payment-panel';
import { FilterBar } from '@/components/dashboard/filter-bar';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { StatusBadge } from '@/components/portal/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api';
import { SETTLEMENT_STATUS_LABELS, formatDateTime, formatMoney, statusLabel } from '@/lib/utils';

interface SettlementRow {
  id: string;
  tradeId: string;
  status: string;
  settledAmount: string;
  createdAt: string;
}

export default function SettlementsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user?.permissions, 'settlement.read');
  const canReport = hasPermission(user?.permissions, 'financial_report.read');
  const [tradeId, setTradeId] = useState('');
  const [lookupId, setLookupId] = useState('');
  const [page, setPage] = useState(1);
  const report = useSWR(canReport ? ['settlement-report', page] : null, () =>
    reportsApi.settlements({ limit: 20, offset: (page - 1) * 20 }),
  );
  const one = useSWR(canRead && lookupId ? ['settlement-trade', lookupId] : null, () =>
    internalSettlementsApi.getByTrade(lookupId),
  );

  if (!canRead && !canReport) return <ForbiddenNotice permission="settlement.read" />;

  const columns: Column<SettlementRow>[] = [
    {
      key: 'trade',
      header: 'معامله',
      render: (row) => <Link href={`/dashboard/trades/${row.tradeId}`}>معامله</Link>,
    },
    { key: 'amount', header: 'تسویه‌شده', render: (row) => formatMoney(row.settledAmount) },
    {
      key: 'status',
      header: 'وضعیت',
      render: (row) => <StatusBadge status={row.status} label={statusLabel(SETTLEMENT_STATUS_LABELS, row.status)} />,
    },
    { key: 'date', header: 'تاریخ', render: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="تسویه"
        description="سابقه تسویه را سرور می‌سازد. از این صفحه مانده دستی اصلاح نمی‌شود."
      />
      {canRead ? (
        <FilterBar
          fields={[{ key: 'tradeId', label: 'شناسه معامله', dir: 'ltr' }]}
          values={{ tradeId }}
          onChange={(_, value) => setTradeId(value)}
          onSubmit={() => setLookupId(tradeId.trim())}
        />
      ) : null}
      {one.error ? <ApiErrorState error={one.error} /> : null}
      {one.data ? (
        <Card>
          <CardHeader><CardTitle>وضعیت معامله</CardTitle></CardHeader>
          <CardContent>
            <SettlementSummary
              settled={one.data.settledAmount}
              status={statusLabel(SETTLEMENT_STATUS_LABELS, one.data.status)}
              settledAt={one.data.settledAt}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {one.error instanceof ApiClientError ? one.error.message : ''}
            </p>
          </CardContent>
        </Card>
      ) : null}
      {report.error ? <ApiErrorState error={report.error} onRetry={() => void report.mutate()} /> : null}
      {canReport ? (
        <DataTable
          columns={columns}
          rows={report.data?.settlements ?? []}
          isLoading={report.isLoading}
          page={page}
          totalPages={report.data ? Math.max(1, Math.ceil((report.data.totalSettled + report.data.totalPending) / 20)) : 1}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
