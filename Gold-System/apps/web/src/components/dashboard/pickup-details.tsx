'use client';

import { StatusBadge } from '@/components/portal/status-badge';
import {
  PickupCancelledCard,
  PickupCustomerCard,
  PickupFeeCard,
  PickupHistoryCard,
  PickupMetricStrip,
  PickupNotesCard,
  PickupRequestCard,
  pickupCustomerName,
} from '@/components/pickups/pickup-cards';
import type { PhysicalGoldPickup } from '@/lib/api';
import { PICKUP_STATUS_LABELS, statusLabel, toPersianDigits } from '@/lib/utils';

/**
 * Body of the in-person gold pickup detail view. Shared by the list-page modal
 * (view + print) so the printed receipt matches the on-screen layout.
 */
export function PickupDetails({ pickup }: { pickup: PhysicalGoldPickup }) {
  return (
    <div className="space-y-4">
      <PickupMetricStrip pickup={pickup} />

      <div className="print-doc-columns grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <PickupCustomerCard pickup={pickup} />
        <PickupRequestCard pickup={pickup} />
      </div>

      <PickupFeeCard pickup={pickup} />
      <PickupNotesCard pickup={pickup} />
      <PickupCancelledCard pickup={pickup} />
      <PickupHistoryCard pickup={pickup} />
    </div>
  );
}

/** Receipt header rendered only on paper. */
export function PickupPrintHeading({ pickup }: { pickup: PhysicalGoldPickup }) {
  const customerName = pickupCustomerName(pickup);

  return (
    <div className="hidden border-b border-gray-300 pb-2 print:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">سامانه طلا — رسید تحویل حضوری</p>
          <p className="mt-1 text-xs text-gray-600">
            شماره درخواست:{' '}
            <span dir="ltr" className="tabular-nums">
              {toPersianDigits(pickup.pickupNumber)}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-gray-600">مشتری: {customerName || '—'}</p>
          {pickup.customer?.customerNumber ? (
            <p className="mt-0.5 text-xs text-gray-600">
              کد مشتری:{' '}
              <span dir="ltr" className="tabular-nums">
                {toPersianDigits(pickup.customer.customerNumber)}
              </span>
            </p>
          ) : null}
        </div>
        <StatusBadge
          status={pickup.status}
          label={statusLabel(PICKUP_STATUS_LABELS, pickup.status)}
        />
      </div>
    </div>
  );
}
