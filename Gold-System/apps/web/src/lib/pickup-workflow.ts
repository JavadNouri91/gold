import type { PhysicalGoldPickupStatus } from '@/lib/api';

/**
 * Presentation-only mapping of the physical pickup workflow.
 *
 * The authoritative transition table lives server-side in
 * `apps/api/src/modules/pickups/domain/constants/pickup-states.ts`:
 *
 *   REQUESTED  → PREPARING | CANCELLED
 *   PREPARING  → READY     | CANCELLED
 *   READY      → DELIVERED | CANCELLED
 *   DELIVERED  → (terminal)
 *   CANCELLED  → (terminal)
 *
 * Nothing here adds or changes a status; it only decides which controls are
 * shown for a status the backend already reported.
 */

/** Actions a staff member can take in a given status. */
export interface PickupAllowedActions {
  startPreparation: boolean;
  markReady: boolean;
  registerDelivery: boolean;
  cancel: boolean;
}

/** Reasons an action is hidden in a given status (shown when relevant). */
export interface PickupActionGuards {
  prepare?: string;
  ready?: string;
  deliver?: string;
  cancel?: string;
}

/**
 * Compute the actions allowed from a pickup's current status. The permission
 * flags passed in are computed from the user's own permissions; the server
 * remains the authorization boundary.
 */
export function pickupActionsFor(
  status: PhysicalGoldPickupStatus,
  perms: { prepare: boolean; deliver: boolean; cancel: boolean },
): PickupAllowedActions {
  switch (status) {
    case 'REQUESTED':
      return {
        startPreparation: perms.prepare,
        markReady: false,
        registerDelivery: false,
        cancel: perms.cancel,
      };
    case 'PREPARING':
      return {
        startPreparation: false,
        markReady: perms.prepare,
        registerDelivery: false,
        cancel: perms.cancel,
      };
    case 'READY':
      return {
        startPreparation: false,
        markReady: false,
        registerDelivery: perms.deliver,
        cancel: perms.cancel,
      };
    case 'DELIVERED':
    case 'CANCELLED':
      return {
        startPreparation: false,
        markReady: false,
        registerDelivery: false,
        cancel: false,
      };
  }
}

/** Human-readable reason an action is unavailable in a given status. */
export function pickupActionGuards(status: PhysicalGoldPickupStatus): PickupActionGuards {
  switch (status) {
    case 'DELIVERED':
      return {
        prepare: 'تحویل انجام شده است؛ امکان شروع آماده‌سازی وجود ندارد.',
        ready: 'تحویل انجام شده است.',
        deliver: 'تحویل قبلاً ثبت شده است.',
        cancel: 'درخواست تحویل شده قابل لغو نیست.',
      };
    case 'CANCELLED':
      return {
        prepare: 'درخواست لغو شده است.',
        ready: 'درخواست لغو شده است.',
        deliver: 'درخواست لغو شده قابل تحویل نیست.',
        cancel: 'درخواست قبلاً لغو شده است.',
      };
    default:
      return {};
  }
}

/**
 * Gold reservation presentation, derived from status only.
 *
 * The actual reservation is authoritative on the backend: requesting a pickup
 * reserves sellable grams until handover, and cancellation releases them.
 * The frontend never mutates balances or reservations.
 */
export type PickupReservationState = 'reserved' | 'released' | 'delivered';

export function pickupReservationState(status: PhysicalGoldPickupStatus): PickupReservationState {
  switch (status) {
    case 'REQUESTED':
    case 'PREPARING':
    case 'READY':
      return 'reserved';
    case 'CANCELLED':
      return 'released';
    case 'DELIVERED':
      return 'delivered';
  }
}

export const PICKUP_RESERVATION_STATE_LABELS: Record<PickupReservationState, string> = {
  reserved: 'رزرو شده تا زمان تحویل',
  released: 'آزاد شده (بازگشت به موجودی قابل‌فروش)',
  delivered: 'تحویل داده شده',
};

export const PICKUP_FEE_STATUS_LABELS: Record<string, string> = {
  NONE: 'بدون کارمزد',
  RESERVED: 'رزرو شده از کیف پول',
  SETTLED: 'کسر شده از کیف پول',
  RELEASED: 'آزاد شده (بازگشت به کیف پول)',
};

/** Short contextual description shown under the page header per status. */
export function pickupStatusHint(status: PhysicalGoldPickupStatus): string {
  switch (status) {
    case 'REQUESTED':
      return 'درخواست ثبت شده و در انتظار شروع آماده‌سازی است.';
    case 'PREPARING':
      return 'قالب آب‌شده در حال آماده‌سازی در فروشگاه است.';
    case 'READY':
      return 'قالب آماده تحویل در فروشگاه است.';
    case 'DELIVERED':
      return 'تحویل حضوری انجام شده و فاکتور صادر شده است.';
    case 'CANCELLED':
      return 'درخواست تحویل حضوری لغو شده است.';
  }
}
