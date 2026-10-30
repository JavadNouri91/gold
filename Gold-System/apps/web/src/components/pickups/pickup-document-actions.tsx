'use client';

import { useState } from 'react';
import { FileText, Printer, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { saveBlob } from '@/lib/download';
import { ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Pre-invoice / invoice download buttons with loading and error states,
 * shared by the pickup fee sheet and the staff detail page header.
 * Downloads flow through the authenticated `fetchBlob` client.
 */
export function PickupDocumentActions({
  pickupNumber,
  documents,
  downloadPreInvoice,
  downloadInvoice,
  showPrint = true,
  onPrint,
  size = 'sm',
  className,
}: {
  pickupNumber: string;
  documents: { preInvoiceAvailable: boolean; invoiceAvailable: boolean };
  downloadPreInvoice: () => Promise<Blob>;
  downloadInvoice: () => Promise<Blob>;
  showPrint?: boolean;
  onPrint?: () => void;
  size?: 'sm' | 'default';
  className?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pre' | 'inv' | null>(null);

  async function run(kind: 'pre' | 'inv', fn: () => Promise<Blob>, fileName: string) {
    setBusy(kind);
    setError(null);
    try {
      const blob = await fn();
      saveBlob(blob, fileName);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'دریافت سند ممکن نیست.');
    } finally {
      setBusy(null);
    }
  }

  const hasDocuments = documents.preInvoiceAvailable || documents.invoiceAvailable;
  // A caller that supplies its own print handler (the detail header, which
  // prints the A5 receipt) can print even before any document exists.
  const hasPrint = showPrint && (hasDocuments || onPrint !== undefined);

  if (!hasDocuments && !hasPrint) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {documents.preInvoiceAvailable ? (
          <Button
            variant="outline"
            size={size}
            className="gap-2"
            isLoading={busy === 'pre'}
            onClick={() =>
              void run(
                'pre',
                downloadPreInvoice,
                `${pickupNumber}-pre-invoice.json`,
              )
            }
          >
            <FileText className="h-4 w-4" aria-hidden />
            پیش‌فاکتور
          </Button>
        ) : null}
        {documents.invoiceAvailable ? (
          <Button
            variant="outline"
            size={size}
            className="gap-2"
            isLoading={busy === 'inv'}
            onClick={() =>
              void run('inv', downloadInvoice, `${pickupNumber}-invoice.json`)
            }
          >
            <Receipt className="h-4 w-4" aria-hidden />
            فاکتور
          </Button>
        ) : null}
        {hasPrint ? (
          <Button
            variant="outline"
            size={size}
            className="gap-2"
            onClick={onPrint ?? (() => window.print())}
          >
            <Printer className="h-4 w-4" aria-hidden />
            چاپ
          </Button>
        ) : null}
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  );
}
