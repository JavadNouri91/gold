'use client';

import { MobileNumber } from '@/components/ui/mobile-input';
import { StatusBadge } from '@/components/portal/status-badge';
import {
  PickupCancelledCard,
  PickupFinancialCard,
  PickupGoldCard,
  PickupNotesCard,
  pickupCustomerName,
} from '@/components/pickups/pickup-cards';
import { type PhysicalGoldPickup } from '@/lib/api';
import {
  PICKUP_STATUS_LABELS,
  formatDate,
  formatDateTime,
  statusLabel,
  toPersianDigits,
} from '@/lib/utils';

/**
 * Printable hand-over receipt for a physical pickup.
 *
 * Everything is printed exactly once so the whole document — signature area
 * included — fits on a single A5 page:
 *  1. header — pickup number, status, customer identity (name, customer code,
 *     mobile), the delivering staff and the four lifecycle timestamps in
 *     workflow order (ثبت‌شده → در حال آماده‌سازی → آماده تحویل → تحویل‌شده)
 *  2. gold facts and the financial/reservation state, side by side
 *  3. notes / cancellation record when present
 *  4. signature area, pinned to the bottom of the same page
 *
 * The status timeline is intentionally left out: all of its timestamps are
 * already on the header.
 */
export function PickupReceipt({ pickup }: { pickup: PhysicalGoldPickup }) {
  return (
    <div className="pickup-receipt flex flex-col gap-3 text-right">
      <ReceiptHeader pickup={pickup} />

      <div className="print-doc-columns grid grid-cols-1 items-stretch gap-3 lg:grid-cols-2">
        <PickupGoldCard pickup={pickup} showTimeline={false} />
        <PickupFinancialCard pickup={pickup} />
      </div>

      <PickupCancelledCard pickup={pickup} />
      <PickupNotesCard pickup={pickup} />

      <PickupSignatureBlock pickup={pickup} className="pickup-signature-bottom" />
    </div>
  );
}

/** Title, pickup number, status, customer identity and delivery dates. */
function ReceiptHeader({ pickup }: { pickup: PhysicalGoldPickup }) {
  const customerName = pickupCustomerName(pickup);
  const customer = pickup.customer;

  return (
    <header className="print-doc-card rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-base font-bold">رسید تحویل حضوری طلا</p>
          <p className="text-xs text-muted-foreground">
            شماره درخواست:{' '}
            <span dir="ltr" className="font-semibold tabular-nums text-foreground">
              {toPersianDigits(pickup.pickupNumber)}
            </span>
          </p>
        </div>
        <StatusBadge
          status={pickup.status}
          label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
        />
      </div>

      <dl className="pickup-receipt-meta mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <HeaderField label="مشتری" value={customerName || '—'} />
        {customer?.customerNumber ? (
          <HeaderField
            label="کد مشتری"
            value={toPersianDigits(customer.customerNumber)}
          />
        ) : null}
        {customer?.mobile ? (
          <div>
            <dt className="text-muted-foreground">موبایل</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              <MobileNumber value={customer.mobile} />
            </dd>
          </div>
        ) : null}
        {pickup.deliveredAt ? (
          <HeaderField
            label="تحویل‌دهنده"
            value={pickup.deliveredByName?.trim() || 'کارشناس فروشگاه'}
          />
        ) : null}
        {/* The four lifecycle timestamps, always in workflow order. */}
        <HeaderField
          label={PICKUP_STATUS_LABELS.REQUESTED}
          value={formatDateTime(pickup.requestedAt)}
        />
        {pickup.preparingAt ? (
          <HeaderField
            label={PICKUP_STATUS_LABELS.PREPARING}
            value={formatDateTime(pickup.preparingAt)}
          />
        ) : null}
        {pickup.readyAt ? (
          <HeaderField
            label={PICKUP_STATUS_LABELS.READY}
            value={formatDateTime(pickup.readyAt)}
          />
        ) : null}
        {pickup.deliveredAt ? (
          <HeaderField
            label={PICKUP_STATUS_LABELS.DELIVERED}
            value={formatDateTime(pickup.deliveredAt)}
          />
        ) : null}
        {!pickup.deliveredAt && pickup.scheduledPickupAt ? (
          <HeaderField
            label="تحویل برنامه‌ریزی‌شده"
            value={formatDate(pickup.scheduledPickupAt)}
          />
        ) : null}
      </dl>
    </header>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/** Signature area for the customer hand-over, pinned to the first page. */
export function PickupSignatureBlock({
  pickup,
  className,
}: {
  pickup: PhysicalGoldPickup;
  className?: string;
}) {
  return (
    <section
      className={`pickup-signature print-doc-card rounded-xl border bg-card p-4 ${className ?? ''}`}
      aria-label="امضا"
    >
      <p className="mb-2 text-base font-semibold">تأیید و امضا</p>
      <p className="mb-3 text-xs leading-6 text-muted-foreground">
        اینجانب{' '}
        <span className="font-medium text-foreground">{pickupCustomerName(pickup) || '................'}</span>{' '}
        تأیید می‌کنم طلای موضوع این رسید با وزن و عیار درج‌شده در حضور من تحویل داده شد و کارمزد
        تحویل/تبدیل طبق این سند تسویه شده است.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-dashed p-2">
          <p className="text-xs text-muted-foreground">امضای مشتری</p>
          <div className="h-10" aria-hidden />
        </div>
        <div className="rounded-lg border border-dashed p-2">
          <p className="text-xs text-muted-foreground">مهر و امضای فروشگاه</p>
          <div className="h-10" aria-hidden />
        </div>
      </div>
    </section>
  );
}
