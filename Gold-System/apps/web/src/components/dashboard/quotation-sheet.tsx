'use client';

import { useEffect, useState } from 'react';
import { internalQuotationsApi, type StaffQuotation } from '@/lib/internal-api';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { ApiClientError } from '@/lib/api';
import {
  QUOTATION_STATUS_LABELS,
  formatDateTime,
  formatFaNumber,
  formatMoney,
  formatWeight,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

export function QuotationDetails({
  quote,
  autoPrint = false,
}: {
  quote: StaffQuotation;
  autoPrint?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await internalQuotationsApi.download(quote.id);
      window.open(file.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'دریافت فایل ممکن نیست.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground print:hidden">مقادیر تاریخی دوباره محاسبه نمی‌شوند.</p>
      {error ? <Alert variant="error">{error}</Alert> : null}
      <p className="text-lg font-semibold" dir="ltr">
        {toPersianDigits(quote.quotationNumber)}
      </p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>نسخه {formatFaNumber(quote.version)}</div>
        <StatusBadge status={quote.status} label={statusLabel(QUOTATION_STATUS_LABELS, quote.status)} />
        <div>وزن {formatWeight(quote.weightGrams)}</div>
        <div>مبلغ {formatMoney(quote.totalAmountRial)}</div>
        <div>قیمت پایه {formatMoney(quote.step1BasePrice)}</div>
        <div>اجرت {formatMoney(quote.wageAmount)}</div>
        <div>تخفیف {formatMoney(quote.discountAmount)}</div>
        <div>رند {formatMoney(quote.roundingAmount)}</div>
        <div>کامل: {quote.isComplete ? 'بله' : 'خیر'}</div>
        <div>{formatDateTime(quote.generatedAt)}</div>
      </dl>
      <div className="flex flex-wrap justify-end gap-2 print:hidden">
        {quote.documentAvailable ? (
          <Button isLoading={busy} onClick={() => void download()}>
            دریافت سند
          </Button>
        ) : null}
        <Button onClick={() => window.print()}>چاپ</Button>
      </div>
    </div>
  );
}
