'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalSettlementsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { SettlementSummary } from '@/components/dashboard/payment-panel';
import { SETTLEMENT_STATUS_LABELS, statusLabel } from '@/lib/utils';

export default function SettlementDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'settlement.read');
  const one = useSWR(allowed ? ['settlement', params.id] : null, () =>
    internalSettlementsApi.getById(params.id),
  );

  if (!allowed) return <ForbiddenNotice permission="settlement.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title="جزئیات تسویه" />
      {one.error ? <ApiErrorState error={one.error} onRetry={() => void one.mutate()} /> : null}
      {one.data ? (
        <div className="space-y-3">
          <SettlementSummary
            settled={one.data.settledAmount}
            status={statusLabel(SETTLEMENT_STATUS_LABELS, one.data.status)}
            settledAt={one.data.settledAt}
          />
          <Link className="text-sm text-gold-800" href={`/dashboard/trades/${one.data.tradeId}`}>
            مشاهده معامله
          </Link>
        </div>
      ) : null}
    </div>
  );
}
