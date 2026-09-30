'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { purchasesApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/portal/status-badge';
import { ApiClientError } from '@/lib/api';
import { PURCHASE_STATUS_LABELS, formatDateTime, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function PurchaseDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'purchase.read');
  const purchase = useSWR(allowed ? ['purchase', params.id] : null, () => purchasesApi.getById(params.id));
  const [action, setAction] = useState<'confirm' | 'cancel' | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!allowed) return <ForbiddenNotice permission="purchase.read" />;

  const run = async (reason?: string) => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'confirm') await purchasesApi.confirm(params.id);
      if (action === 'cancel') await purchasesApi.cancel(params.id, reason ?? '');
      setFeedback('وضعیت خرید به‌روز شد.');
      setAction(null);
      void purchase.mutate();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const row = purchase.data;

  return (
    <div className="space-y-4">
      <PageHeader title="جزئیات خرید" description={row?.purchaseNumber} />
      {purchase.error ? <ApiErrorState error={purchase.error} /> : null}
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {row ? (
        <Card>
          <CardHeader><CardTitle>خرید</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusBadge status={row.status} label={statusLabel(PURCHASE_STATUS_LABELS, row.status)} />
            <p>مبلغ {formatMoney(row.totalAmountRial)}</p>
            <p>وزن {formatWeight(row.weightGrams)}</p>
            <p>نوع تسویه {row.settlementType}</p>
            <p>{formatDateTime(row.purchaseDate)}</p>
            <p>تأیید: {formatDateTime(row.confirmedAt)}</p>
            <div className="flex gap-2 pt-2">
              <PermissionGate anyOf="purchase.confirm">
                <Button onClick={() => setAction('confirm')}>تأیید خرید</Button>
              </PermissionGate>
              <PermissionGate anyOf="purchase.create">
                <Button variant="destructive" onClick={() => setAction('cancel')}>لغو پیش‌نویس</Button>
              </PermissionGate>
            </div>
          </CardContent>
        </Card>
      ) : null}
      <ConfirmDialog
        open={action !== null}
        title={action === 'cancel' ? 'لغو خرید' : 'تأیید خرید'}
        message="ثبت دفتر فقط در سرور انجام می‌شود."
        destructive={action === 'cancel'}
        requireReason={action === 'cancel'}
        minReason={5}
        isLoading={busy}
        onClose={() => setAction(null)}
        onConfirm={(reason) => void run(reason)}
      />
    </div>
  );
}
