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
  WHOLESALE = 'WHOLESALE',
  CORPORATE = 'CORPORATE',
}

export enum CustomerGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
  NOT_SPECIFIED = 'NOT_SPECIFIED',
}

export enum CustomerLevel {
  NORMAL = 'NORMAL',
  VIP = 'VIP',
  PREMIUM = 'PREMIUM',
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
