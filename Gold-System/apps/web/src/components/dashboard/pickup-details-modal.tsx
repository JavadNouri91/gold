'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink, Printer, X } from 'lucide-react';
import { staffPickupsApi } from '@/lib/internal-api';
import { usePrintPageSize } from '@/lib/print';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { PickupDetails, PickupPrintHeading } from '@/components/dashboard/pickup-details';

/**
 * Read-only in-person gold pickup dialog with print support.
 * Printing is isolated to the dialog and rendered as an A5 receipt that keeps
 * the on-screen layout (KPI strip, two-column cards, colours).
 */
export function PickupDetailsModal({
  pickupId,
  open,
  onClose,
  autoPrint = false,
}: {
  pickupId: string | null;
  open: boolean;
  onClose: () => void;
  autoPrint?: boolean;
}) {
  const pickup = useSWR(open && pickupId ? ['staff-pickup', pickupId] : null, () =>
    staffPickupsApi.getById(pickupId as string),
  );

  usePrintPageSize(open ? 'A5 portrait' : null);

  useEffect(() => {
    if (!open) return;
    document.body.dataset.printDoc = 'true';
    return () => {
      delete document.body.dataset.printDoc;
    };
  }, [open]);

  useEffect(() => {
    if (!autoPrint || !pickup.data) return;
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, [autoPrint, pickup.data]);

  const row = pickup.data;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="جزئیات تحویل حضوری"
      titleClassName="sr-only"
      rootClassName="print-doc-host p-2 sm:p-4"
      className="print-doc max-h-[92vh] w-full max-w-5xl overflow-y-auto border border-border/80 bg-[#fbfaf7] p-4 text-right sm:p-6"
    >
      <header className="print-screen-only mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
        <div className="min-w-0 space-y-1">
          {row ? (
            <p dir="ltr" className="text-sm font-semibold tabular-nums">
              {row.pickupNumber}
            </p>
          ) : (
            <SkeletonBlock className="h-5 w-32" />
          )}
          {row?.customer ? (
            <p className="text-xs text-muted-foreground">
              مشتری: {`${row.customer.firstName} ${row.customer.lastName}`.trim()}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            چاپ
          </Button>
          {row ? (
            <Link href={`/dashboard/pickups/${row.id}`} className="print:hidden">
              <Button variant="ghost" size="sm" className="gap-2">
                <ExternalLink className="h-4 w-4" aria-hidden />
                صفحه کامل
              </Button>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted print:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {pickup.error ? (
        <ApiErrorState error={pickup.error} onRetry={() => void pickup.mutate()} />
      ) : null}
      {!row && !pickup.error ? <SkeletonBlock className="h-40" /> : null}

      {row ? (
        <>
          <PickupPrintHeading pickup={row} />
          <PickupDetails pickup={row} />
        </>
      ) : null}
    </Modal>
  );
}
