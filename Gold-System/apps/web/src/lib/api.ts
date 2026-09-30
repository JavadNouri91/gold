/**
 * API Client
 *
 * All HTTP communication with the backend goes through this module.
 * Never scatter fetch() calls in components.
 *
 * - Auth header is attached automatically when a token is in storage.
 * - 401 responses trigger a silent token refresh; if refresh fails, the
 *   user is redirected to /portal/login.
 * - Errors are normalised to ApiClientError with a Persian message.
 */

import type { ApiResponse, PaginationMeta } from '@gold/shared-types';

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:4001';

const API_BASE = `${BASE_URL}/api/v1`;

// ─── Token storage ────────────────────────────────────────────────────────────

const TOKEN_KEY = 'gold_access_token';
const REFRESH_KEY = 'gold_refresh_token';

export const tokenStore = {
  getAccess(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  },
  setAccess(token: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  getRefresh(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  setRefresh(token: string) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(REFRESH_KEY, token);
  },
  clear() {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ─── Error ────────────────────────────────────────────────────────────────────

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isConflict() {
    return this.status === 409;
  }
  get isValidation() {
    return this.status === 400 || this.status === 422;
  }
}

// ─── Core request ─────────────────────────────────────────────────────────────

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

/** Staff dashboard and customer portal use different login screens. */
export function sessionLoginPath(): string {
  if (typeof window === 'undefined') return '/portal/login';
  return window.location.pathname.startsWith('/dashboard') ? '/dashboard/login' : '/portal/login';
}

async function rawRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    const err = json.error;
    throw new ApiClientError(
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'خطای ناشناخته',
      res.status,
      err?.details,
    );
  }

  return json.data as T;
}

export async function fetchBlob(path: string): Promise<Blob> {
  const token = tokenStore.getAccess();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 204) return new Blob();
  if (!res.ok) {
    let message = 'دریافت فایل انجام نشد';
    try {
      const json = (await res.json()) as ApiResponse<unknown>;
      message = json.error?.message ?? message;
    } catch {
      message = 'دریافت فایل انجام نشد';
    }
    throw new ApiClientError('FILE_FETCH_FAILED', message, res.status);
  }
  return res.blob();
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = tokenStore.getAccess();

  try {
    return await rawRequest<T>(path, options, token ?? undefined);
  } catch (err) {
    if (err instanceof ApiClientError && err.isUnauthorized) {
      // Try to refresh
      const refreshToken = tokenStore.getRefresh();
      if (!refreshToken) {
        tokenStore.clear();
        if (typeof window !== 'undefined') {
          window.location.href = sessionLoginPath();
        }
        throw err;
      }

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push((newToken) => {
            rawRequest<T>(path, options, newToken).then(resolve).catch(reject);
          });
        });
      }

      isRefreshing = true;
      try {
        const { accessToken, refreshToken: newRefresh } = await rawRequest<{
          accessToken: string;
          refreshToken: string;
          expiresIn: number;
        }>('/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
        tokenStore.setAccess(accessToken);
        tokenStore.setRefresh(newRefresh);
        refreshQueue.forEach((cb) => cb(accessToken));
        refreshQueue = [];
        return rawRequest<T>(path, options, accessToken);
      } catch {
        tokenStore.clear();
        if (typeof window !== 'undefined') {
          window.location.href = sessionLoginPath();
        }
        throw err;
      } finally {
        isRefreshing = false;
      }
    }
    throw err;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginResponse {
  message: string;
  requiresOtp: boolean;
  userId?: string;
}

export interface OtpResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    mobile: string;
    roles: string[];
    permissions: string[];
  };
}

export const authApi = {
  login(mobile: string, password: string): Promise<LoginResponse> {
    return rawRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ mobile, password }),
    });
  },

  verifyOtp(mobile: string, code: string): Promise<OtpResponse> {
    return rawRequest('/auth/otp', {
      method: 'POST',
      body: JSON.stringify({ mobile, otp: code }),
    });
  },

  refresh(refreshToken: string): Promise<OtpResponse> {
    return rawRequest('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  logout(): Promise<{ revoked: boolean }> {
    const refreshToken = tokenStore.getRefresh();
    return request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    });
  },

  sessions(): Promise<AuthSession[]> {
    return request('/auth/sessions');
  },

  confirmSession(confirmationToken: string, revokeSessionId: string): Promise<OtpResponse> {
    return rawRequest('/auth/session-confirm', {
      method: 'POST',
      body: JSON.stringify({ confirmationToken, revokeSessionId }),
    });
  },

  closeOtherSessions(confirmationToken: string): Promise<OtpResponse> {
    return rawRequest('/auth/session-confirm/close-others', {
      method: 'POST',
      body: JSON.stringify({ confirmationToken }),
    });
  },

  revokeSession(sessionId: string): Promise<{ revoked: boolean }> {
    return request(`/auth/sessions/${sessionId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },

  revokeOtherSessions(): Promise<{ revokedCount: number }> {
    return request('/auth/sessions/revoke-others', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },
};

export interface AuthSession {
  id: string;
  createdAt: string;
  lastActivityAt?: string;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress: string | null;
  device?: string;
  browser?: string;
  os?: string;
  current?: boolean;
  status?: 'ACTIVE';
}

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  nationalId?: string;
  mobile: string;
  email?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  postalCode?: string | null;
  type?: string | null;
  status: string;
  accountStatus?: string;
  hasAvatar?: boolean;
  userId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface UpdateOwnProfileInput {
  email?: string;
  address?: string;
  postalCode?: string;
}

export interface DeletionRequestResult {
  accepted: boolean;
  deleted: boolean;
  message: string;
}

export const customerApi = {
  getMe(): Promise<CustomerProfile> {
    return request('/customers/me');
  },

  updateMe(input: UpdateOwnProfileInput): Promise<CustomerProfile> {
    return request('/customers/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  requestDeletion(): Promise<DeletionRequestResult> {
    return request('/customers/me/deletion-request', { method: 'POST' });
  },

  uploadAvatar(file: File): Promise<CustomerProfile> {
    const body = new FormData();
    body.append('file', file);
    return request('/customers/me/avatar', { method: 'POST', body });
  },

  getMyAccount(): Promise<CustomerAccount> {
    return request('/customers/me/account');
  },

  listMyCreditTransactions(limit = 20): Promise<CreditLedgerEntry[]> {
    return request(`/customers/me/account/transactions?limit=${limit}`);
  },
};

// ─── Customer Account ─────────────────────────────────────────────────────────

export interface CustomerAccount {
  id: string;
  customerId: string;
  status: string;
  creditLimitRial: string;
  reservedCreditRial: string;
  consumedCreditRial: string;
  creditLimitGoldRial: string;
  reservedCreditGoldRial: string;
  consumedCreditGoldRial: string;
  availableCreditRial: string;
  /** Server field from GET /customers/me/account. Prefer this over recomputing. */
  availableRial?: string;
  updatedAt?: string;
}

export interface CreditLedgerEntry {
  id: string;
  type: string;
  creditPool: string;
  amount: string;
  balanceAfter: string;
  sourceType: string | null;
  sourceId: string | null;
  reason: string | null;
  createdAt: string;
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export interface KycDocument {
  id: string;
  customerId: string;
  documentType: string;
  fileReference: string;
  status?: string;
  verificationStatus: string;
  rejectionReason?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface KycVerification {
  id: string;
  customerId: string;
  status: string;
  decisionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type KycPhase =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'NEEDS_CORRECTION';

export type KycDocumentDisplayStatus =
  | 'NOT_UPLOADED'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_CORRECTION';

export interface OwnKycFile {
  id: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface OwnKycDocument {
  type: string;
  label: string;
  required: boolean;
  canUpload: boolean;
  canDelete: boolean;
  displayStatus: KycDocumentDisplayStatus;
  file: OwnKycFile | null;
}

export interface OwnKycHistoryEvent {
  id: string;
  occurredAt: string;
  title: string;
  statusLabel: string;
  tone: 'done' | 'pending' | 'rejected';
  description: string;
}

export interface OwnKycOverview {
  phase: KycPhase;
  identityComplete: boolean;
  customerStatus: string;
  rejectionReason: string | null;
  submittedAt: string | null;
  upload: {
    maxBytes: number;
    mimeTypes: string[];
  };
  documents: OwnKycDocument[];
  history: OwnKycHistoryEvent[];
}

export const kycApi = {
  getMine(): Promise<OwnKycOverview> {
    return request('/customers/me/kyc');
  },

  getOwnDocumentFile(documentId: string): Promise<Blob> {
    return fetchBlob(`/customers/me/documents/${documentId}/file`);
  },

  getDocuments(customerId: string): Promise<KycDocument[]> {
    return request<KycDocument[]>(`/customers/${customerId}/documents`).then((docs) =>
      docs.map((doc) => ({
        ...doc,
        verificationStatus: doc.verificationStatus || doc.status || 'PENDING',
      })),
    );
  },

  uploadDocument(documentType: string, file: File): Promise<KycDocument> {
    const formData = new FormData();
    formData.append('documentType', documentType);
    formData.append('file', file);
    return request('/customers/me/documents', {
      method: 'POST',
      body: formData,
    });
  },

  deleteOwnDocument(documentId: string): Promise<void> {
    return request(`/customers/me/documents/${documentId}`, { method: 'DELETE' });
  },

  getKycHistory(customerId: string): Promise<KycVerification[]> {
    return request(`/customers/${customerId}/kyc/history`);
  },
};

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface CurrentPrice {
  id?: string;
  snapshotId?: string;
  rawValue?: string;
  normalizedValue: string;
  unit: string;
  currency?: string;
  capturedAt: string;
  validityStatus: string;
  purityReference?: string | null;
  /** ISO timestamp from PRICE_SNAPSHOT_TTL_SECONDS. Absent when the API has no TTL. */
  expiresAt?: string | null;
  ttlSeconds?: number | null;
}

/** Canonical calculate response from PricingService. */
export interface PricingCalculationResult {
  calculationId: string;
  pipeline: {
    step1_basePrice: string;
    step2_afterGlobalAdj: string;
    step3_purityConv: 'DEFERRED' | string;
    step4_afterWeight: string;
    step5_afterGroupRule: string;
    wageAmount: string;
    profitAmount: string | null;
    taxAmount: string | null;
    discountAmount: string;
    priceBeforeRounding: string;
    roundingAmount: string;
    finalPrice: string;
  };
  isComplete: boolean;
  blockedSteps: string[];
  meta: {
    snapshotId: string;
    globalAdjId: string | null;
    pricingRuleId: string | null;
    weightGrams: string;
    purityRatio: string;
    customerType: string | null;
  };
}

export const pricingApi = {
  getCurrentPrice(): Promise<CurrentPrice> {
    return request('/pricing/current-price');
  },

  calculate(input: {
    weightGrams: string;
    purityRatio: string;
    customerType?: string;
    priceSnapshotId?: string;
  }): Promise<PricingCalculationResult> {
    return request('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  customerType?: string;
  reservedAmountRial: string;
  pricingCalculationId?: string;
  submittedAt?: string;
  cancelledAt?: string;
  rejectedAt?: string;
  cancellationReason?: string;
  createdAt: string;
}

export interface CreateOrderInput {
  weightGrams: string;
  purityRatio: string;
  /** Locks the snapshot the customer reviewed. The server still prices the order. */
  priceSnapshotId?: string;
  /** Recorded on the order item. Omitted orders stay unclassified. */
  side?: 'BUY' | 'SELL';
}

export interface ListOrdersResponse {
  data: Order[];
  meta: PaginationMeta;
}

export type ActivityBucket = 'week' | 'month' | 'quarter' | 'year';

export interface ActivitySideTotal {
  amountRial: string;
  grams: string;
  count: number;
}

export interface ActivitySegment {
  id: 'BUY' | 'SELL' | 'UNCLASSIFIED';
  grams: string;
  share: string;
}

export interface ActivitySeriesPoint {
  key: string;
  buyGrams: string;
  sellGrams: string;
  unclassifiedGrams: string;
}

export interface ActivitySummary {
  pnl: {
    supported: boolean;
    realizedRial: string | null;
    unrealizedRial: string | null;
    totalRial: string | null;
    changePercent: string | null;
  };
  volume: { grams: string; count: number; unit: string };
  buy: ActivitySideTotal;
  sell: ActivitySideTotal;
  unclassified: ActivitySideTotal;
  distribution: { unit: string; segments: ActivitySegment[] };
  series: ActivitySeriesPoint[];
  purities: string[];
  excludedCount: number;
  totalsBasis: 'booked' | 'status-filter';
  meta: PaginationMeta;
  hasAny: boolean;
}

export interface ActivityTransaction {
  id: string;
  orderNumber: string;
  side: 'BUY' | 'SELL' | null;
  status: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string | null;
  totalAmountRial: string;
  createdAt: string;
  submittedAt: string | null;
  confirmedAt: string | null;
  reservedAmountRial: string | null;
  countsTowardVolume: boolean;
  tradeId: string | null;
  tradeNumber: string | null;
  quotationId: string | null;
  quotationNumber: string | null;
  wageAmount: string | null;
  taxAmount: string | null;
  paymentMethods: string[];
  settlementStatus: string | null;
}

export interface ActivityList {
  data: ActivityTransaction[];
  meta: PaginationMeta;
}

export interface ActivityParams {
  from: string;
  to: string;
  side?: 'BUY' | 'SELL';
  status?: string;
  purityRatio?: string;
  q?: string;
  page?: number;
  limit?: number;
  bucket?: ActivityBucket;
}

function activityQuery(params: ActivityParams): string {
  const query = new URLSearchParams();
  query.set('from', params.from);
  query.set('to', params.to);
  if (params.side) query.set('side', params.side);
  if (params.status) query.set('status', params.status);
  if (params.purityRatio) query.set('purityRatio', params.purityRatio);
  if (params.q) query.set('q', params.q);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.bucket) query.set('bucket', params.bucket);
  return query.toString();
}

export const ordersApi = {
  list(params?: { status?: string; limit?: number; offset?: number }): Promise<ListOrdersResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return request(`/orders?${query.toString()}`);
  },

  getById(id: string): Promise<Order> {
    return request(`/orders/${id}`);
  },

  create(input: CreateOrderInput): Promise<Order> {
    return request('/orders', { method: 'POST', body: JSON.stringify(input) });
  },

  submit(id: string): Promise<Order> {
    return request(`/orders/${id}/submit`, { method: 'POST' });
  },

  cancel(id: string, reason: string): Promise<Order> {
    return request(`/orders/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  getQuotations(id: string): Promise<Quotation[]> {
    return request(`/orders/${id}/quotations`);
  },

  activitySummary(params: ActivityParams): Promise<ActivitySummary> {
    return request(`/orders/activity/summary?${activityQuery(params)}`);
  },

  activityList(params: ActivityParams): Promise<ActivityList> {
    return request(`/orders/activity?${activityQuery(params)}`);
  },

  activityDetail(id: string): Promise<ActivityTransaction> {
    return request(`/orders/${id}/activity`);
  },
};

// ─── Quotations ───────────────────────────────────────────────────────────────

export interface Quotation {
  id: string;
  quotationNumber?: string;
  orderId: string;
  version: number;
  status: string;
  validUntil?: string;
  generatedAt: string;
  pricingCalculationId?: string;
  documentReference?: string;
}

export const quotationsApi = {
  getById(id: string): Promise<Quotation> {
    return request(`/quotations/${id}`);
  },

  getDownloadUrl(id: string): string {
    return `${API_BASE}/quotations/${id}/download`;
  },
};

// ─── Trades ───────────────────────────────────────────────────────────────────

export interface Trade {
  id: string;
  tradeNumber: string;
  orderId: string;
  quotationId?: string;
  customerId: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string;
  wageAmount?: string;
  profitAmount?: string;
  taxAmount?: string;
  discountAmount?: string;
  customerType?: string;
  confirmedAt?: string;
  createdAt: string;
}

export interface ListTradesResponse {
  data: Trade[];
  meta: PaginationMeta;
}

export const tradesApi = {
  list(params?: { limit?: number; offset?: number }): Promise<ListTradesResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    return request(`/trades?${query.toString()}`);
  },

  getById(id: string): Promise<Trade> {
    return request(`/trades/${id}`);
  },
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  tradeId: string;
  customerId: string;
  method: string;
  amount: string;
  status: string;
  referenceNumber?: string | null;
  notes?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  orderId?: string | null;
  orderNumber?: string | null;
  tradeNumber?: string | null;
  relatedSide?: 'BUY' | 'SELL' | null;
  hasReceipt?: boolean;
}

export interface PaymentAmountCount {
  count: number;
  amountRial: string;
}

export interface PaymentSummary {
  totalPaid: PaymentAmountCount;
  successful: PaymentAmountCount;
  failed: PaymentAmountCount;
  reversed: PaymentAmountCount;
  hasAny: boolean;
}

export type PaymentStatusGroup = 'successful' | 'failed' | 'reversed' | 'submitted';
export type PaymentLedgerType = 'BUY' | 'SELL' | 'OTHER';

export interface ListPaymentsResponse {
  data: Payment[];
  meta: PaginationMeta;
}

export interface ListOwnPaymentsParams {
  from: string;
  to: string;
  page?: number;
  limit?: number;
  statusGroup?: PaymentStatusGroup;
  type?: PaymentLedgerType;
  q?: string;
}

function paymentQuery(params: ListOwnPaymentsParams): string {
  const query = new URLSearchParams();
  query.set('from', params.from);
  query.set('to', params.to);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.statusGroup) query.set('statusGroup', params.statusGroup);
  if (params.type) query.set('type', params.type);
  if (params.q) query.set('q', params.q);
  return query.toString();
}

export const paymentsApi = {
  list(params: ListOwnPaymentsParams): Promise<ListPaymentsResponse> {
    return request(`/payments?${paymentQuery(params)}`);
  },

  summary(params: Omit<ListOwnPaymentsParams, 'page' | 'limit' | 'statusGroup'>): Promise<PaymentSummary> {
    return request(`/payments/summary?${paymentQuery(params)}`);
  },

  getById(id: string): Promise<Payment> {
    return request(`/payments/${id}`);
  },

  payableTrades(): Promise<Array<{ id: string; tradeNumber: string; orderNumber: string | null; totalAmountRial: string }>> {
    return request('/payments/receipts/trades');
  },

  submitReceipt(input: { tradeId: string; method: string; amount: string; referenceNumber?: string; file: File }): Promise<Payment> {
    const body = new FormData();
    body.set('tradeId', input.tradeId);
    body.set('method', input.method);
    body.set('amount', input.amount);
    if (input.referenceNumber) body.set('referenceNumber', input.referenceNumber);
    body.set('file', input.file);
    return request('/payments/receipts', { method: 'POST', body });
  },

  getByTrade(tradeId: string): Promise<Payment[]> {
    return request(`/payments/trade/${tradeId}`);
  },
};

// ─── Settlements ──────────────────────────────────────────────────────────────

export interface Settlement {
  id: string;
  tradeId: string;
  status: string;
  settledAmount: string;
  settledAt?: string;
  createdAt: string;
}

export const settlementsApi = {
  getByTrade(tradeId: string): Promise<Settlement> {
    return request(`/settlements/trade/${tradeId}`);
  },

  getById(id: string): Promise<Settlement> {
    return request(`/settlements/${id}`);
  },
};

// ─── Notifications ────────────────────────────────────────────────────────────

export interface NotificationRelation {
  kind: 'order' | 'trade' | 'payment' | 'quotation' | 'kyc' | 'settlement';
  href: string;
  number: string | null;
  amountRial: string | null;
  weightGrams: string | null;
  status: string | null;
  referenceNumber: string | null;
}

export interface Notification {
  id: string;
  recipientId: string | null;
  type: string;
  channel: string;
  status: string;
  subject: string | null;
  body: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  readAt: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export interface NotificationDetail extends Notification {
  relation: NotificationRelation | null;
}

export type NotificationReadFilter = 'all' | 'unread' | 'read';
export type NotificationCategory = 'trades' | 'financial' | 'kyc' | 'account';
export type NotificationSort = 'newest' | 'oldest';

export interface NotificationSummary {
  unread: number;
  trades: number;
  financial: number;
  kyc: number;
  account: number;
}

export interface ListNotificationsResponse {
  items: Notification[];
  meta: PaginationMeta;
}

export interface ListNotificationsParams {
  read?: NotificationReadFilter;
  category?: NotificationCategory;
  q?: string;
  from?: string;
  to?: string;
  sort?: NotificationSort;
  page?: number;
  limit?: number;
}

export const notificationsApi = {
  list(params?: ListNotificationsParams): Promise<ListNotificationsResponse> {
    const query = new URLSearchParams();
    if (params?.read && params.read !== 'all') query.set('read', params.read);
    if (params?.category) query.set('category', params.category);
    if (params?.q) query.set('q', params.q);
    if (params?.from) query.set('from', params.from);
    if (params?.to) query.set('to', params.to);
    if (params?.sort && params.sort !== 'newest') query.set('sort', params.sort);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const text = query.toString();
    return request(`/notifications${text ? `?${text}` : ''}`);
  },

  summary(): Promise<NotificationSummary> {
    return request('/notifications/summary');
  },

  getById(id: string): Promise<NotificationDetail> {
    return request(`/notifications/${id}`);
  },

  markRead(id: string): Promise<Notification> {
    return request(`/notifications/${id}/read`, { method: 'PATCH' });
  },

  markReadIds(ids: string[]): Promise<{ updated: number }> {
    return request('/notifications/read', { method: 'PATCH', body: JSON.stringify({ ids }) });
  },

  markAllRead(): Promise<{ updated: number }> {
    return request('/notifications/read-all', { method: 'PATCH' });
  },
};
