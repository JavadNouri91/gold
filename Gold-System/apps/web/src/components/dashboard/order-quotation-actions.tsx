'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QuotationModal } from '@/components/dashboard/quotation-modal';
import { orderMayHaveQuotation } from '@/lib/order-quotation';

export function OrderQuotationActions({
  orderId,
  status,
}: {
  orderId: string;
  status?: string | null;
}) {
  const [mode, setMode] = useState<'view' | 'print' | null>(null);

  if (status != null && !orderMayHaveQuotation(status)) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setMode('view')}>
          نمایش
        </Button>
        <Button size="sm" className="gap-1" onClick={() => setMode('print')}>
          <Printer className="h-3.5 w-3.5" aria-hidden />
          چاپ
        </Button>
      </div>
      <QuotationModal
        orderId={orderId}
        open={mode != null}
        autoPrint={mode === 'print'}
        onClose={() => setMode(null)}
      />
    </>
  );
}
