// ============================================================
// Gold System — Shared Types
// Shared between apps/api and apps/web
// ============================================================

// ─── API Response envelope ───────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: PaginationMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// ─── Domain enums (mirrored from Prisma) ─────────────────────

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  DEACTIVATED = 'DEACTIVATED',
}

export enum CustomerType {
  HOUSEHOLD = 'HOUSEHOLD',
  PARTNER = 'PARTNER',
  VIP = 'VIP',
}

export enum CustomerGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  NOT_SPECIFIED = 'NOT_SPECIFIED',
}

export enum ReferenceSource {
  FRIEND_REFERRAL = 'FRIEND_REFERRAL',
  INTERNET_SEARCH = 'INTERNET_SEARCH',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  IN_PERSON = 'IN_PERSON',
  ADVERTISEMENT = 'ADVERTISEMENT',
  OTHER = 'OTHER',
}

/** Operational account state. Kept separate from KYC `CustomerStatus`. */
export enum CustomerAccountStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

export enum CustomerStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
}

export enum OrderStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  QUOTED = 'QUOTED',
  ASSIGNED = 'ASSIGNED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  REVISION_REQUESTED = 'REVISION_REQUESTED',
  REJECTED = 'REJECTED',
  APPROVED = 'APPROVED',
  TRADE_CREATED = 'TRADE_CREATED',
  SETTLING = 'SETTLING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Five customer/staff display groups. The raw OrderStatus machine is unchanged. */
export const OrderStatusGroup = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  COMPLETED: 'COMPLETED',
  CLOSED: 'CLOSED',
} as const;

export type OrderStatusGroup = (typeof OrderStatusGroup)[keyof typeof OrderStatusGroup];

export const ORDER_STATUS_GROUP_MEMBERS: Record<OrderStatusGroup, readonly OrderStatus[]> = {
  DRAFT: [OrderStatus.DRAFT],
  IN_REVIEW: [
    OrderStatus.SUBMITTED,
    OrderStatus.QUOTED,
    OrderStatus.ASSIGNED,
    OrderStatus.UNDER_REVIEW,
  ],
  REVISION_REQUESTED: [OrderStatus.REVISION_REQUESTED],
  COMPLETED: [
    OrderStatus.APPROVED,
    OrderStatus.TRADE_CREATED,
    OrderStatus.SETTLING,
    OrderStatus.COMPLETED,
  ],
  CLOSED: [OrderStatus.REJECTED, OrderStatus.CANCELLED],
};

export const ORDER_STATUS_GROUP_ORDER: readonly OrderStatusGroup[] = [
  'DRAFT',
  'IN_REVIEW',
  'REVISION_REQUESTED',
  'COMPLETED',
  'CLOSED',
];

/** Retired display keys; still accepted on list/activity filters. */
const ORDER_STATUS_FILTER_ALIASES: Record<string, OrderStatusGroup> = {
  AWAITING_REVIEW: 'IN_REVIEW',
  APPROVED: 'COMPLETED',
};

const ORDER_STATUS_TO_GROUP = Object.fromEntries(
  ORDER_STATUS_GROUP_ORDER.flatMap((group) =>
    ORDER_STATUS_GROUP_MEMBERS[group].map((status) => [status, group]),
  ),
) as Record<OrderStatus, OrderStatusGroup>;

export const ORDER_STATUS_QUERY_VALUES: readonly string[] = Array.from(
  new Set([
    ...Object.values(OrderStatus),
    ...Object.values(OrderStatusGroup),
    ...Object.keys(ORDER_STATUS_FILTER_ALIASES),
  ]),
);

export function orderStatusGroup(status: string): OrderStatusGroup | null {
  if (status in ORDER_STATUS_FILTER_ALIASES) return ORDER_STATUS_FILTER_ALIASES[status]!;
  if ((ORDER_STATUS_GROUP_ORDER as readonly string[]).includes(status)) {
    return status as OrderStatusGroup;
  }
  return ORDER_STATUS_TO_GROUP[status as OrderStatus] ?? null;
}

/** Expand a UI group or a raw machine status into Prisma `status in (...)`. */
export function expandOrderStatusFilter(status: string): OrderStatus[] {
  const aliased = ORDER_STATUS_FILTER_ALIASES[status];
  const group = aliased
    ?? ((ORDER_STATUS_GROUP_ORDER as readonly string[]).includes(status)
      ? (status as OrderStatusGroup)
      : null);
  if (group) return [...ORDER_STATUS_GROUP_MEMBERS[group]];
  if ((Object.values(OrderStatus) as string[]).includes(status)) return [status as OrderStatus];
  return [];
}

export enum QuotationStatus {
  GENERATED = 'GENERATED',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',     // only when associated Order is cancelled
  REVISED = 'REVISED',     // superseded by new version
  CONVERTED = 'CONVERTED', // Trade approved
}

export enum AssignmentStatus {
  ACTIVE    = 'ACTIVE',    // Currently assigned; awaiting review decision
  COMPLETED = 'COMPLETED', // Review decision reached (approved/rejected/revision requested)
  CANCELLED = 'CANCELLED', // Superseded by reassignment or Order cancellation
}

export enum TradeStatus {
  PENDING_CONFIRMATION = 'PENDING_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  SETTLING = 'SETTLING',
  COMPLETED = 'COMPLETED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  REVERSED = 'REVERSED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  ALLOCATED = 'ALLOCATED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

export enum PaymentMethod {
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD_TO_CARD = 'CARD_TO_CARD',
  CASH = 'CASH',
}

export enum PaymentDirection {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  COMPLETED = 'COMPLETED',
}

export enum PurchaseStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  // SETTLING and SETTLED are DEFERRED — not in MVP
}

export enum VerificationStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum AdjustmentMode {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum AdjustmentDirection {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export enum TradeSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum FeeMode {
  NONE = 'NONE',
  FIXED = 'FIXED',
  PERCENTAGE = 'PERCENTAGE',
}

export enum FeeCalculationBase {
  GOLD_VALUE_STEP4 = 'GOLD_VALUE_STEP4',
  AFTER_GROUP_RULE_STEP5 = 'AFTER_GROUP_RULE_STEP5',
  GOLD_COMMERCIAL_TOTAL = 'GOLD_COMMERCIAL_TOTAL',
  /** Gold value at the moment a physical pickup is requested (per-gram price × weight). */
  PICKUP_GOLD_VALUE = 'PICKUP_GOLD_VALUE',
}

export enum FeeChargeCode {
  TRANSACTION_FEE = 'TRANSACTION_FEE',
  /** Fee for converting melted gold into a physical bar at the store. */
  PICKUP_CONVERSION_FEE = 'PICKUP_CONVERSION_FEE',
}

/** Side a fee policy applies to. BUY/SELL are transaction fees; PICKUP is physical conversion. */
export enum FeeChargeSide {
  BUY = 'BUY',
  SELL = 'SELL',
  PICKUP = 'PICKUP',
}

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum GoldDirection {
  IN = 'IN',
  OUT = 'OUT',
}

export enum FinancialSourceType {
  TRADE_CONFIRM = 'TRADE_CONFIRM',
  TRADE_REVERSAL = 'TRADE_REVERSAL',
  PURCHASE_CONFIRM = 'PURCHASE_CONFIRM',
  PAYMENT = 'PAYMENT',
  MANUAL = 'MANUAL',
}

export enum GoldSourceType {
  TRADE_CONFIRM = 'TRADE_CONFIRM',
  TRADE_REVERSAL = 'TRADE_REVERSAL',
  PURCHASE_CONFIRM = 'PURCHASE_CONFIRM',
  ADJUSTMENT = 'ADJUSTMENT',
  PICKUP_DELIVER = 'PICKUP_DELIVER',
}

/** In-store redemption of melted-gold balance as a physical bar. */
export enum PhysicalGoldPickupStatus {
  REQUESTED = 'REQUESTED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// ─── Ledger Source Types ──────────────────────────────────────────────────────

export enum LedgerSourceType {
  TRADE_CONFIRM   = 'TRADE_CONFIRM',
  TRADE_REVERSAL  = 'TRADE_REVERSAL',
  PURCHASE_CONFIRM = 'PURCHASE_CONFIRM',
  PAYMENT         = 'PAYMENT',
  MANUAL          = 'MANUAL',
  ADJUSTMENT      = 'ADJUSTMENT',
}

// ─── Auth types ───────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string;      // userId
  mobile: string;
  roles: string[];
  permissions: string[];
  /** Present on tokens issued after session limits. Legacy tokens omit it. */
  sid?: string;
  iat?: number;
  exp?: number;
}
