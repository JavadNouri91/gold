'use client';

import { Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PickupDocumentActions } from '@/components/pickups/pickup-document-actions';
import { type PhysicalGoldPickup } from '@/lib/api';
import { PICKUP_FEE_STATUS_LABELS } from '@/lib/pickup-workflow';
import { formatFeeRate, formatWholeMoney } from '@/lib/utils';

/**
 * Printable conversion-fee sheet for a physical pickup. Renders the immutable
 * fee snapshot + pre-invoice / invoice download buttons. Shared by the portal
 * and staff dashboard detail pages.
 */
export function PickupFeeSheet({
  pickup,
  downloadPreInvoice,
  downloadInvoice,
}: {
  pickup: PhysicalGoldPickup;
  downloadPreInvoice: () => Promise<Blob>;
  downloadInvoice: () => Promise<Blob>;
}) {
  const fee = pickup.fee;
  const hasFee = !!fee && fee.mode !== 'NONE';
  const rateText = fee ? formatFeeRate(fee.mode, fee.rateValue) : null;

  return (
    <Card className="pickup-fee-sheet">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" aria-hidden />
          کارمزد تبدیل به فیزیکی
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasFee ? (
          <p className="text-sm leading-7 text-muted-foreground">
            برای این درخواست کارمزد تبدیل تعریف نشده است.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">نوع کارمزد</dt>
              <dd className="font-medium">
                {rateText ?? (fee?.labelFa || 'کارمزد تبدیل')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">وضعیت</dt>
              <dd className="font-medium">{PICKUP_FEE_STATUS_LABELS[fee?.status ?? 'NONE']}</dd>
            </div>
            {fee?.goldPricePerGramRial ? (
              <div>
                <dt className="text-muted-foreground">قیمت هر گرم</dt>
                <dd className="font-medium">{formatWholeMoney(fee.goldPricePerGramRial)}</dd>
              </div>
            ) : null}
            {fee && fee.mode === 'PERCENTAGE' ? (
              <div>
                <dt className="text-muted-foreground">ارزش طلا (مبنای محاسبه)</dt>
                <dd className="font-medium">{formatWholeMoney(fee.baseAmountRial)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">مبلغ کارمزد</dt>
              <dd className="font-bold text-gold-800">{formatWholeMoney(fee?.amountRial)}</dd>
            </div>
            {fee?.walletAvailableAfterRial ? (
              <div>
                <dt className="text-muted-foreground">موجودی پس از رزرو</dt>
                <dd className="font-medium">{formatWholeMoney(fee.walletAvailableAfterRial)}</dd>
              </div>
            ) : null}
          </dl>
        )}

        <p className="hidden border-b border-gray-200 pb-3 text-sm font-bold text-gray-900 print:block">
          بهای طلا در معامله خرید قبلی تسویه شده؛ این سند فقط کارمزد تبدیل/تحویل است.
        </p>

        <PickupDocumentActions
          pickupNumber={pickup.pickupNumber}
          documents={pickup.documents}
          downloadPreInvoice={downloadPreInvoice}
          downloadInvoice={downloadInvoice}
        />
      </CardContent>
    </Card>
  );
}
