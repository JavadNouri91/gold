'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { internalOrdersApi, internalQuotationsApi } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { QuotationDetails } from '@/components/dashboard/quotation-sheet';
import { featuredStaffQuotation } from '@/lib/order-quotation';

function CloseIconButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="بستن پیش‌فاکتور"
      title="بستن"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 print:hidden"
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function QuotationModal({
  open,
  onClose,
  orderId,
  quotationId,
  autoPrint = false,
}: {
  open: boolean;
  onClose: () => void;
  orderId?: string | null;
  quotationId?: string | null;
  autoPrint?: boolean;
}) {
  const byOrder = useSWR(open && orderId ? ['order-quotes', orderId] : null, () =>
    internalOrdersApi.quotations(orderId as string),
  );
  const byId = useSWR(open && quotationId && !orderId ? ['quotation', quotationId] : null, () =>
    internalQuotationsApi.getById(quotationId as string),
  );

  useEffect(() => {
    if (!open) return;
    document.body.dataset.printQuotation = 'true';
    return () => {
      delete document.body.dataset.printQuotation;
    };
  }, [open]);

  const quote = orderId ? featuredStaffQuotation(byOrder.data ?? []) : (byId.data ?? null);
  const error = orderId ? byOrder.error : byId.error;
  const retry = () => {
    if (orderId) void byOrder.mutate();
    else void byId.mutate();
  };
  const loading = orderId ? !byOrder.data && !byOrder.error : !byId.data && !byId.error;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="پیش‌فاکتور طلا"
      titleClassName="sr-only"
      rootClassName="quotation-print-host"
      className="quotation-print-root max-h-[90vh] max-w-4xl overflow-y-auto border border-border/80 bg-[#fbfaf7] p-4 sm:p-6"
    >
      {quote ? (
        <QuotationDetails
          quote={quote}
          autoPrint={autoPrint}
          onClose={onClose}
          onChanged={() => {
            if (orderId) void byOrder.mutate();
            else void byId.mutate();
          }}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <CloseIconButton onClose={onClose} />
          </div>
          {error ? <ApiErrorState error={error} onRetry={retry} /> : null}
          {loading ? <SkeletonBlock className="h-32" /> : null}
          {!loading && !error ? (
            <p className="text-sm text-muted-foreground">برای این سفارش پیش‌فاکتوری صادر نشده است.</p>
          ) : null}
          <div className="flex justify-end print:hidden">
            <Button variant="ghost" className="min-w-[7rem] gap-2" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden />
              بستن
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
