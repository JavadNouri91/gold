'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/portal/status-badge';
import { PickupDocumentActions } from '@/components/pickups/pickup-document-actions';
import { PickupReceiptModal } from '@/components/pickups/pickup-receipt-modal';
import { type PhysicalGoldPickup } from '@/lib/api';
import { pickupStatusHint } from '@/lib/pickup-workflow';
import { PICKUP_STATUS_LABELS, statusLabel, toPersianDigits } from '@/lib/utils';

/**
 * Header for the staff pickup detail page: back link, title, pickup number,
 * status badge, a one-line contextual description and the document toolbar.
 *
 * "چاپ" in the toolbar behaves exactly like the button in the "تحویل انجام شد"
 * card: it opens the A5 receipt and sends it straight to the printer. Only a
 * delivered pickup gets this receipt — other statuses still print the page.
 */
export function PickupDetailHeader({
  pickup,
  downloadPreInvoice,
  downloadInvoice,
}: {
  pickup: PhysicalGoldPickup;
  downloadPreInvoice: () => Promise<Blob>;
  downloadInvoice: () => Promise<Blob>;
}) {
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptPrint, setReceiptPrint] = useState(false);
  const isDelivered = pickup.status === 'DELIVERED';

  function print() {
    if (!isDelivered) {
      window.print();
      return;
    }
    setReceiptPrint(true);
    setReceiptOpen(true);
  }

  return (
    <header className="space-y-3">
      <Link
        href="/dashboard/pickups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        بازگشت به فهرست تحویل‌ها
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-xl font-bold md:text-2xl">تحویل حضوری</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span dir="ltr" className="text-sm font-medium tabular-nums text-muted-foreground">
              {toPersianDigits(pickup.pickupNumber)}
            </span>
            <StatusBadge
              status={pickup.status}
              label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
            />
          </div>
          <p className="text-sm text-muted-foreground">{pickupStatusHint(pickup.status)}</p>
        </div>

        <div className="print-screen-only">
          <PickupDocumentActions
            pickupNumber={pickup.pickupNumber}
            documents={pickup.documents}
            downloadPreInvoice={downloadPreInvoice}
            downloadInvoice={downloadInvoice}
            onPrint={print}
          />
        </div>
      </div>

      {isDelivered ? (
        <PickupReceiptModal
          pickup={pickup}
          open={receiptOpen}
          autoPrint={receiptPrint}
          onClose={() => {
            setReceiptOpen(false);
            setReceiptPrint(false);
          }}
        />
      ) : null}
    </header>
  );
}
