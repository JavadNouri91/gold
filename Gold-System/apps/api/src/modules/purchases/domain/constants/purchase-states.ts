/**
 * Purchase Domain Constants
 *
 * Purchase state machine per architecture/STATE-MACHINES.md:
 *   DRAFT → CONFIRMED   (MVP scope)
 *   SETTLING / SETTLED  (DEFERRED §8.4)
 *   CANCELLED           (before confirmation only)
 *
 * BR-U02: Settlement type can be RIAL or GOLD.
 */

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  SETTLING = 'SETTLING', // DEFERRED §8.4
  SETTLED = 'SETTLED', // DEFERRED §8.4
  CANCELLED = 'CANCELLED',
}

export enum PurchaseSettlementType {
  RIAL = 'RIAL',
  GOLD = 'GOLD',
}

/** Valid state transitions per architecture/STATE-MACHINES.md */
export const VALID_PURCHASE_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  [PurchaseStatus.DRAFT]: [PurchaseStatus.CONFIRMED, PurchaseStatus.CANCELLED],
  [PurchaseStatus.CONFIRMED]: [PurchaseStatus.SETTLING], // DEFERRED — not active in MVP
  [PurchaseStatus.SETTLING]: [PurchaseStatus.SETTLED], // DEFERRED
  [PurchaseStatus.SETTLED]: [],
  [PurchaseStatus.CANCELLED]: [],
};
