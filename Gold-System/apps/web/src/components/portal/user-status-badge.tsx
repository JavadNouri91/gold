'use client';

import { Badge } from '@/components/ui/badge';
import { CUSTOMER_STATUS_LABELS, customerTypeBadgeLabel, cn } from '@/lib/utils';

export function UserStatusBadge({
  type,
  status,
}: {
  type?: string | null;
  status?: string | null;
}) {
  const typeLabel = customerTypeBadgeLabel(type);
  const statusLabel = status ? (CUSTOMER_STATUS_LABELS[status] ?? status) : null;
  const active = status === 'ACTIVE' || status === 'APPROVED';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {typeLabel ? (
        <Badge variant="default" className="rounded-md bg-[#FFF4D6] font-medium text-[#B77900]">
          {typeLabel}
        </Badge>
      ) : null}
      {statusLabel ? (
        <Badge
          variant={active ? 'green' : 'gray'}
          className={cn(
            'gap-1.5 rounded-md font-medium',
            active ? 'bg-[#ECFDF3] text-[#16A34A]' : undefined,
          )}
        >
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              active ? 'bg-green-600' : 'bg-gray-400',
            )}
            aria-hidden
          />
          {statusLabel}
        </Badge>
      ) : null}
    </div>
  );
}
