'use client';

import useSWR from 'swr';
import { Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalTradesApi } from '@/lib/internal-api';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { TradeDetails, TradePrintHeading } from '@/components/dashboard/trade-details';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { usePrintPageSize } from '@/lib/print';
import { TRADE_STATUS_LABELS, statusLabel, toPersianDigits } from '@/lib/utils';

export default function TradeDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, ['trade.read', 'trade.approve']);
  const trade = useSWR(allowed ? ['trade', params.id] : null, () =>
    internalTradesApi.getById(params.id),
  );

  usePrintPageSize('A5 portrait');

  if (!allowed) return <ForbiddenNotice permission="trade.read" />;

  const row = trade.data;

  return (
    <div className="print-doc space-y-4">
      <header className="print-screen-only flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold md:text-2xl">جزئیات معامله</h1>
          {row?.tradeNumber ? (
            <div className="flex flex-wrap items-center gap-2">
              <span dir="ltr" className="text-sm font-medium tabular-nums text-muted-foreground">
                {toPersianDigits(row.tradeNumber)}
              </span>
              <StatusBadge
                status={row.status}
                label={statusLabel(TRADE_STATUS_LABELS, row.status)}
              />
            </div>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="print-screen-only gap-2"
          onClick={() => window.print()}
        >
          <Printer className="h-4 w-4" aria-hidden />
          چاپ
        </Button>
      </header>

      {trade.error ? <ApiErrorState error={trade.error} onRetry={() => void trade.mutate()} /> : null}
      {!row && !trade.error ? <SkeletonBlock className="h-24" /> : null}

      {row ? (
        <>
          <TradePrintHeading trade={row} />
          <TradeDetails trade={row} onChanged={() => void trade.mutate()} />
        </>
      ) : null}
    </div>
  );
}
