'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalQuotationsApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api';
import { QUOTATION_STATUS_LABELS, formatDateTime, formatMoney, formatWeight, statusLabel } from '@/lib/utils';

export default function QuotationDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'quotation.read');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quote = useSWR(allowed ? ['quotation', params.id] : null, () =>
    internalQuotationsApi.getById(params.id),
  );

  if (!allowed) return <ForbiddenNotice permission="quotation.read" />;

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await internalQuotationsApi.download(params.id);
      window.open(file.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'دریافت فایل ممکن نیست.');
    } finally {
      setBusy(false);
    }
  };

  const row = quote.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="پیش‌فاکتور"
        description="مقادیر تاریخی دوباره محاسبه نمی‌شوند."
        actions={
          row?.documentAvailable ? (
            <Button isLoading={busy} onClick={() => void download()}>دریافت سند</Button>
          ) : null
        }
      />
      {quote.error ? <ApiErrorState error={quote.error} onRetry={() => void quote.mutate()} /> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {row ? (
        <Card>
          <CardHeader>
            <CardTitle dir="ltr">{row.quotationNumber}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <p>نسخه {row.version.toLocaleString('fa-IR')}</p>
            <StatusBadge status={row.status} label={statusLabel(QUOTATION_STATUS_LABELS, row.status)} />
            <p>وزن {formatWeight(row.weightGrams)}</p>
            <p>مبلغ {formatMoney(row.totalAmountRial)}</p>
            <p>قیمت پایه {formatMoney(row.step1BasePrice)}</p>
            <p>اجرت {formatMoney(row.wageAmount)}</p>
            <p>تخفیف {formatMoney(row.discountAmount)}</p>
            <p>رند {formatMoney(row.roundingAmount)}</p>
            <p>کامل: {row.isComplete ? 'بله' : 'خیر'}</p>
            <p>{formatDateTime(row.generatedAt)}</p>
            <Link href={`/dashboard/customers/${row.customerId}`}>مشتری</Link>
            <Link href={`/dashboard/orders/${row.orderId}`}>سفارش</Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
