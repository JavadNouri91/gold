'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { internalOrdersApi, internalQuotationsApi } from '@/lib/internal-api';
import { Modal } from '@/components/ui/modal';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { QuotationDetails } from '@/components/dashboard/quotation-sheet';
import { featuredStaffQuotation } from '@/lib/order-quotation';

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
      title="پیش‌فاکتور"
      rootClassName="quotation-print-host"
      className="quotation-print-root max-h-[90vh] max-w-2xl overflow-y-auto"
    >
      {error ? <ApiErrorState error={error} onRetry={retry} /> : null}
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {!loading && !error && !quote ? (
        <p className="text-sm text-muted-foreground">برای این سفارش پیش‌فاکتوری صادر نشده است.</p>
      ) : null}
      {quote ? <QuotationDetails quote={quote} autoPrint={autoPrint} /> : null}
    </Modal>
  );
}
