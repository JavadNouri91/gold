'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalCustomersApi, internalKycApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { KycDecisionPanel, KycDocumentList } from '@/components/dashboard/kyc-panel';
import { StatusBadge } from '@/components/portal/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CUSTOMER_STATUS_LABELS, KYC_STATUS_LABELS, formatDateTime, statusLabel } from '@/lib/utils';

export default function KycDetailPage({ params }: { params: { customerId: string } }) {
  const { user } = useAuth();
  const canReview = hasPermission(user?.permissions, 'kyc.review');
  const canDocs = hasPermission(user?.permissions, 'kyc.documents.read');
  const customer = useSWR(
    hasPermission(user?.permissions, 'customer.read') ? ['kyc-customer', params.customerId] : null,
    () => internalCustomersApi.getById(params.customerId),
  );
  const history = useSWR(canReview ? ['kyc-history', params.customerId] : null, () =>
    internalKycApi.history(params.customerId),
  );

  if (!canReview && !canDocs) return <ForbiddenNotice permission="kyc.review" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="بررسی احراز هویت"
        description={customer.data ? `${customer.data.fullName} — ${customer.data.customerNumber}` : 'پرونده مشتری'}
      />
      {customer.data ? (
        <p className="text-sm">
          وضعیت مشتری:{' '}
          <Link className="text-gold-800" href={`/dashboard/customers/${customer.data.id}`}>
            {statusLabel(CUSTOMER_STATUS_LABELS, customer.data.status)}
          </Link>
        </p>
      ) : null}
      {customer.error ? <ApiErrorState error={customer.error} /> : null}
      <Card>
        <CardHeader><CardTitle>مدارک</CardTitle></CardHeader>
        <CardContent>
          <PermissionGate anyOf="kyc.documents.read" fallback={<p className="text-sm">مجوز مشاهده مدرک ندارید.</p>}>
            <KycDocumentList customerId={params.customerId} customerType={customer.data?.type} />
          </PermissionGate>
        </CardContent>
      </Card>
      {canReview ? (
        <KycDecisionPanel
          customerId={params.customerId}
          reviewStatus={history.data?.[0]?.status}
          onDone={() => {
            void history.mutate();
            void customer.mutate();
          }}
        />
      ) : null}
      <Card>
        <CardHeader><CardTitle>سوابق بررسی</CardTitle></CardHeader>
        <CardContent>
          {!canReview ? <p className="text-sm text-muted-foreground">سابقه بررسی نیاز به مجوز بررسی احراز دارد.</p> : null}
          {history.error ? <ApiErrorState error={history.error} /> : null}
          <ul className="divide-y text-sm">
            {(history.data ?? []).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <StatusBadge status={item.status} label={statusLabel(KYC_STATUS_LABELS, item.status)} />
                <span>{formatDateTime(item.createdAt)}</span>
                <span>{item.decisionReason ?? '—'}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
