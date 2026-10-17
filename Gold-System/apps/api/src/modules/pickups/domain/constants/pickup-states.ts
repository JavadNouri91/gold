import { PhysicalGoldPickupStatus } from '@gold/shared-types';

export { PhysicalGoldPickupStatus };

/** Store pickup is always molten gold at millesimal 750. */
export const PICKUP_PURITY_RATIO = '0.750000';

/** Staff/customer transitions allowed from each status. */
export const PICKUP_TRANSITIONS: Record<
  PhysicalGoldPickupStatus,
  readonly PhysicalGoldPickupStatus[]
> = {
  [PhysicalGoldPickupStatus.REQUESTED]: [
    PhysicalGoldPickupStatus.PREPARING,
    PhysicalGoldPickupStatus.CANCELLED,
  ],
  [PhysicalGoldPickupStatus.PREPARING]: [
    PhysicalGoldPickupStatus.READY,
    PhysicalGoldPickupStatus.CANCELLED,
  ],
  [PhysicalGoldPickupStatus.READY]: [
    PhysicalGoldPickupStatus.DELIVERED,
    PhysicalGoldPickupStatus.CANCELLED,
  ],
  [PhysicalGoldPickupStatus.DELIVERED]: [],
  [PhysicalGoldPickupStatus.CANCELLED]: [],
};

/** Statuses that still reserve sellable grams (not yet handed over). */
export const PICKUP_RESERVED_STATUSES: readonly PhysicalGoldPickupStatus[] = [
  PhysicalGoldPickupStatus.REQUESTED,
  PhysicalGoldPickupStatus.PREPARING,
  PhysicalGoldPickupStatus.READY,
];

/** Customer may cancel only before staff starts preparing the bar. */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly PhysicalGoldPickupStatus[] = [
  PhysicalGoldPickupStatus.REQUESTED,
];
