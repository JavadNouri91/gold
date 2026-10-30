'use client';

import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { PickupReceipt } from '@/components/pickups/pickup-receipt';
import { type PhysicalGoldPickup } from '@/lib/api';

/**
 * Read-only receipt dialog used from the staff pickup detail page once the
 * hand-over is registered. "نمایش" opens it, "چاپ" opens it and sends it to the
 * printer — printing is isolated to the dialog (`.print-doc-host`), so only the
 * receipt reaches the paper on an A5 sheet.
 */
export function PickupReceiptModal({
  pickup,
  open,
  onClose,
  autoPrint = false,
}: {
  pickup: PhysicalGoldPickup;
  open: boolean;
  onClose: () => void;
  autoPrint?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.dataset.printDoc = 'true';
    return () => {
      delete document.body.dataset.printDoc;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !autoPrint) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [open, autoPrint]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="رسید تحویل حضوری"
      titleClassName="sr-only"
      rootClassName="print-doc-host p-2 sm:p-4"
      className="print-doc max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-border/80 bg-[#fbfaf7] p-4 text-right sm:p-6"
    >
      <div className="print-screen-only mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
        <p className="text-sm font-semibold">رسید تحویل حضوری — قابل امضا توسط مشتری</p>
        <div className="flex items-center gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" aria-hidden />
            چاپ
          </Button>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted print:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <PickupReceipt pickup={pickup} />
    </Modal>
  );
}
