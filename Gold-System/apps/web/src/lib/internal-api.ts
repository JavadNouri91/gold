/**
 * Staff API methods.
 *
 * Every call goes through the shared request() client.
 * Response shapes follow the existing backend DTOs. Values are not recalculated here.
 */

import type { PaginationMeta } from '@gold/shared-types';
import { fetchBlob, request } from './api';

export function toQuery(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

export type PageMeta = PaginationMeta;

export interface StaffCustomer {
  id: string;
  customerNumber: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  nationalId: string;
  mobile: string;
  email: string | null;
  dateOfBirth: string | null;
  address: string | null;
  type: string | null;
  gender: string | null;
  level: string | null;
  postalCode: string | null;
  phone: string | null;
  referenceSource: string | null;
  companyName: string | null;
  companyNationalId: string | null;
  companyEconomicId: string | null;
  contactName: string | null;
  contactTitle: string | null;
  secondaryMobile: string | null;
  workPhone: string | null;
  fax: string | null;
  workAddress: string | null;
  contactNotes: string | null;
  province: string | null;
  city: string | null;
  status: string;
  accountStatus?: string;
  verificationStatus?: string;
  segment?: string;
  rejectionReason: string | null;
  isTradeEligible: boolean;
  orderCount?: number;
  lastPurchaseAt?: string | null;
  balanceRial?: string | null;
  totalPurchaseRial?: string | null;
  totalWeightGrams?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerSummary {
  total: number;
  active: number;
  vip: number;
  debtors: number | null;
  newCustomers: number;
}

export interface CustomerWorkspace {
  customer: StaffCustomer;
  metrics: {
    totalPurchaseRial: string | null;
    totalWeightGrams: string;
    orderCount: number;
    lastPurchaseAt: string | null;
    balanceRial: string | null;
  };
  segment: string;
  verificationStatus: string;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    createdAt: string;
  }>;
  quotations: Array<{
    id: string;
    quotationNumber: string;
    status: string;
    totalAmountRial: string;
    createdAt: string;
  }>;
  invoices: Array<{
    id: string;
    tradeNumber: string;
    status: string;
    totalAmountRial: string;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    status: string;
    method: string;
    referenceNumber: string | null;
    createdAt: string;
  }> | null;
  notes: Array<{
    id: string;
    body: string;
    authorName: string | null;
    createdAt: string;
  }>;
  canViewFinancials: boolean;
}

export interface StaffCustomerList {
  items: StaffCustomer[];
  meta: PageMeta;
}

export interface StaffAccount {
  id: string;
  customerId: string;
  status: string;
  creditLimitRial: string;
  reservedCreditRial: string;
  consumedCreditRial: string;
  availableRial: string;
  creditLimitGoldRial: string;
  reservedCreditGoldRial: string;
  consumedCreditGoldRial: string;
  availableGoldRial: string;
}

export interface KycDocumentRecord {
  id: string;
  customerId: string;
  documentType: string;
  fileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  status?: string;
  verificationStatus: string;
  rejectionReason?: string | null;
  signedUrl?: string;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface KycHistoryRecord {
  id: string;
  customerId: string;
  status: string;
  decisionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerAccountId?: string;
  pricingCalculationId?: string | null;
  status: string;
  totalAmountRial: string;
  reservedAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  customerType?: string | null;
  submittedAt?: string | null;
  cancelledAt?: string | null;
  rejectedAt?: string | null;
  cancellationReason?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffOrderList {
  orders: StaffOrder[];
  meta: PageMeta;
}

export interface StaffQuotationItem {
  id: string;
  quotationId: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string;
  totalPriceRial: string;
  description: string | null;
  createdAt: string;
}

export interface StaffQuotation {
  id: string;
  quotationNumber: string;
  orderId: string;
  customerId: string;
  pricingCalculationId: string;
  version: number;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  step1BasePrice: string | null;
  wageAmount: string | null;
  discountAmount: string | null;
  roundingAmount: string | null;
  isComplete: boolean;
  documentAvailable: boolean;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
  items: StaffQuotationItem[];
}

export interface StaffQuotationList {
  quotations: StaffQuotation[];
  meta: PageMeta;
}

export interface QuotationDownload {
  quotationId: string;
  quotationNumber: string;
  downloadUrl: string;
  mimeType: string;
  expiresIn: string;
}

export interface AssignmentRecord {
  id: string;
  orderId: string;
  quotationId: string;
  assignedToId: string;
  assignedById: string;
  status: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentList {
  assignments: AssignmentRecord[];
  total: number;
  meta: PageMeta;
}

export interface ReviewContext {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountRial: string;
    reservedAmountRial: string;
    weightGrams: string;
    purityRatio: string;
    customerType: string | null;
    submittedAt: string | null;
    createdAt: string;
  };
  customer: {
    id: string;
    customerNumber: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    type: string | null;
    status: string;
    kycStatus: string | null;
  };
  account: {
    id: string;
    status: string;
    creditLimitRial: string;
    reservedCreditRial: string;
    consumedCreditRial: string;
    availableCreditRial: string;
  } | null;
  quotation: {
    id: string;
    quotationNumber: string;
    version: number;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    purityRatio: string;
    step1BasePrice: string | null;
    wageAmount: string | null;
    discountAmount: string | null;
    roundingAmount: string | null;
    isComplete: boolean;
    documentKey: string | null;
    generatedAt: string;
  } | null;
  activeAssignment: AssignmentRecord | null;
}

export interface StaffTrade {
  id: string;
  tradeNumber: string;
  orderId: string;
  quotationId: string;
  customerId: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string;
  step1BasePrice: string | null;
  wageAmount: string | null;
  profitAmount: string | null;
  taxAmount: string | null;
  discountAmount: string | null;
  roundingAmount: string | null;
  isComplete: boolean;
  customerType: string | null;
  confirmedByUserId: string;
  confirmedAt: string;
  reversedByUserId: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffTradeList {
  trades: StaffTrade[];
  total: number;
  page: number;
  limit: number;
}

export interface StaffPayment {
  id: string;
  tradeId: string;
  customerId: string;
  method: string;
  amount: string;
  currency: string;
  status: string;
  referenceNumber: string | null;
  notes: string | null;
  receivedAt: string | null;
  validatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TradePaymentStatus {
  tradeId: string;
  tradeTotal: string;
  totalAllocated: string;
  remaining: string;
  isFullyPaid: boolean;
  settlementStatus: string;
  payments: StaffPayment[];
}

export interface StaffSettlement {
  id: string;
  tradeId: string;
  status: string;
  settledAmount: string;
  settledAt: string | null;
  settledByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierRecord {
  id: string;
  supplierNumber: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  integrationMode: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierAccountRecord {
  id: string;
  supplierId: string;
  status: string;
  totalPurchasedRial: string;
  totalPaidRial: string;
  outstandingRial: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseRecord {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  status: string;
  settlementType: string;
  purchaseDate: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  pricePerGramRial: string;
  supplierReference: string | null;
  notes: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerAccount {
  code: string;
  name: string;
  nameFa: string;
  type?: string;
  active: boolean;
  blockedReason: string | null;
}

export interface LedgerJournal {
  id: string;
  sourceType: string;
  sourceId: string;
  description: string | null;
  postedAt: string;
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
  entries: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    description: string | null;
    createdAt: string;
  }>;
}

export interface LedgerJournalList {
  journals: LedgerJournal[];
  total: number;
  limit: number;
  offset: number;
}

export interface AccountBalance {
  accountCode: string;
  totalDebit: string;
  totalCredit: string;
  balance: string;
  currency: string;
}

export interface GoldJournal {
  id: string;
  sourceType: string;
  sourceId: string;
  description: string | null;
  postedAt: string;
  entries: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    direction: string;
    quantity: string;
    purity: string;
    description: string | null;
    createdAt: string;
  }>;
}

export interface GoldJournalList {
  journals: GoldJournal[];
  total: number;
  limit: number;
  offset: number;
}

export interface GoldBalance {
  accountCode: string;
  totalIn: string;
  totalOut: string;
  netPosition: string;
  unit: string;
}

export interface DashboardSummary {
  totalCustomers: number;
  customersByType: Record<string, number>;
  pendingKyc: number;
  activeCustomers: number;
  suspendedCustomers: number;
  pendingOrders: number;
  ordersAwaitingReview: number;
  ordersApproved: number;
  ordersRejected: number;
  ordersCancelled: number;
  ordersTotal: number;
  confirmedTrades: number;
  completedTrades: number;
  reversedTrades: number;
  totalTradeValueRial: string | null;
  totalTradeWeightGrams: string | null;
  totalPaymentsRecorded: number;
  totalPaymentsValueRial: string | null;
  settledTrades: number;
  unsettledTrades: number;
  supplierPayableRial: string | null;
  salesRevenueRial: string | null;
  purchaseCostRial: string | null;
  goldPositionGrams: string | null;
  goldObligationGrams: string | null;
  totalSuppliers: number;
  activeSuppliers: number;
  totalPurchasedRial: string | null;
  pendingPurchases: number;
  confirmedPurchases: number;
  recentTrades: Array<{
    id: string;
    tradeNumber: string;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    confirmedAt: string | null;
    createdAt: string;
  }>;
  recentPayments: Array<{
    id: string;
    tradeId: string;
    method: string;
    amount: string;
    status: string;
    createdAt: string;
  }>;
}

export interface CustomerReportRow {
  id: string;
  customerNumber: string;
  firstName: string;
  lastName: string;
  mobile: string;
  type: string | null;
  status: string;
  kycStatus: string | null;
  creditLimitRial: string | null;
  consumedCreditRial: string | null;
  reservedCreditRial: string | null;
  availableCreditRial: string | null;
  createdAt: string;
}

export interface CustomerReport {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  pendingKyc: number;
  customers: CustomerReportRow[];
}

export interface OrderReport {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  orders: Array<{
    id: string;
    orderNumber: string;
    customerId: string;
    customerNumber: string | null;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    createdAt: string;
  }>;
}

export interface TradeReport {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  totalWeightGrams: string | null;
  trades: Array<{
    id: string;
    tradeNumber: string;
    customerId: string;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    createdAt: string;
  }>;
}

export interface PaymentReport {
  total: number;
  byStatus: Record<string, number>;
  byMethod: Record<string, string>;
  totalValueRial: string | null;
  payments: Array<{
    id: string;
    tradeId: string;
    customerId: string;
    method: string;
    amount: string;
    status: string;
    referenceNumber: string | null;
    createdAt: string;
  }>;
}

export interface SettlementReport {
  totalSettled: number;
  totalPending: number;
  totalSettledValueRial: string | null;
  totalPendingValueRial: string | null;
  settlements: Array<{
    id: string;
    tradeId: string;
    status: string;
    settledAmount: string;
    createdAt: string;
  }>;
}

export interface FinancialReport {
  accountBalances: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    totalDebit: string;
    totalCredit: string;
    netBalance: string;
  }>;
  entries: Array<{
    id: string;
    journalId: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    description: string | null;
    sourceType: string;
    sourceId: string;
    createdAt: string;
  }>;
  totalEntries: number;
}

export interface GoldReport {
  accountBalances: Array<{
    accountCode: string;
    accountName: string;
    netQuantityGrams: string;
    totalInGrams: string;
    totalOutGrams: string;
  }>;
  entries: Array<{
    id: string;
    accountCode: string;
    accountName: string;
    direction: string;
    quantity: string;
    purity: string;
    sourceType: string;
    sourceId: string;
    createdAt: string;
  }>;
  totalEntries: number;
}

export interface SupplierReport {
  total: number;
  active: number;
  suspended: number;
  totalPurchasedRial: string | null;
  suppliers: Array<{
    id: string;
    supplierNumber: string;
    name: string;
    status: string;
    totalPurchasedRial: string | null;
    totalPaidRial: string | null;
    outstandingRial: string | null;
    createdAt: string;
  }>;
}

export interface PurchaseReport {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  totalWeightGrams: string | null;
  purchases: Array<{
    id: string;
    purchaseNumber: string;
    supplierId: string;
    supplierName: string | null;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    createdAt: string;
  }>;
}

export interface PricingReport {
  totalSnapshots: number;
  snapshots: Array<{
    id: string;
    rawValue: string;
    normalizedValue: string;
    capturedAt: string;
    status: string;
  }>;
  totalCalculations: number;
  calculations: Array<{
    id: string;
    sourceType: string;
    sourceId: string;
    basePrice: string;
    finalPrice: string;
    calculatedAt: string;
  }>;
}

export interface AuditReport {
  total: number;
  logs: Array<{
    id: string;
    actorId: string | null;
    actorType: string;
    action: string;
    entityType: string | null;
    entityId: string | null;
    before: unknown;
    after: unknown;
    reason: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

export interface ReportQuery {
  from?: string;
  to?: string;
  status?: string;
  type?: string;
  customerId?: string;
  customerType?: string;
  method?: string;
  tradeId?: string;
  supplierId?: string;
  accountCode?: string;
  sourceType?: string;
  direction?: string;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export interface StaffNotification {
  id: string;
  recipientId: string | null;
  channel: string;
  type: string;
  subject: string | null;
  body: string;
  status: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sentAt: string | null;
  createdAt: string;
}

export const internalCustomersApi = {
  /** Check if an email address is available (not yet registered to another customer). */
  checkEmailAvailable(email: string): Promise<{ available: boolean }> {
    return request(`/customers/check-email?email=${encodeURIComponent(email)}`);
  },

  list(params: {
    status?: string;
    type?: string;
    search?: string;
    accountStatus?: string;
    verificationStatus?: string;
    segment?: string;
    financialStatus?: string;
    createdFrom?: string;
    createdTo?: string;
    lastPurchaseFrom?: string;
    lastPurchaseTo?: string;
    page?: number;
    limit?: number;
  }): Promise<StaffCustomerList> {
    return request(`/customers${toQuery(params)}`);
  },
  summary(): Promise<CustomerSummary> {
    return request('/customers/summary');
  },
  exportCsv(params: object): Promise<{ content: string }> {
    return request(`/customers/export${toQuery(params)}`);
  },
  importRows(rows: Array<{
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    password: string;
    email?: string;
    address?: string;
  }>): Promise<{ created: number; failed: number; errors: Array<{ row: number; message: string }> }> {
    return request('/customers/import', { method: 'POST', body: JSON.stringify({ rows }) });
  },
  workspace(id: string): Promise<CustomerWorkspace> {
    return request(`/customers/${id}/workspace`);
  },
  update(id: string, body: {
    firstName?: string;
    lastName?: string;
    nationalId?: string;
    mobile?: string;
    email?: string;
    address?: string;
  }): Promise<StaffCustomer> {
    return request(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  setAccountStatus(id: string, accountStatus: string, reason: string): Promise<{ id: string; accountStatus: string }> {
    return request(`/customers/${id}/account-status`, {
      method: 'PATCH',
      body: JSON.stringify({ accountStatus, reason }),
    });
  },
  addNote(id: string, body: string): Promise<CustomerWorkspace['notes'][number]> {
    return request(`/customers/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) });
  },
  deleteNote(id: string, noteId: string): Promise<{ id: string }> {
    return request(`/customers/${id}/notes/${noteId}`, { method: 'DELETE' });
  },
  getById(id: string): Promise<StaffCustomer> {
    return request(`/customers/${id}`);
  },
  assignType(id: string, type: string, reason = 'تغییر نوع مشتری از پرونده'): Promise<StaffCustomer> {
    return request(`/customers/${id}/type`, {
      method: 'PATCH',
      body: JSON.stringify({ type, reason }),
    });
  },
  register(body: {
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    email?: string;
    dateOfBirth?: string;
    address?: string;
    password: string;
    // Extended staff registration fields
    type?: string;
    gender?: string;
    level?: string;
    postalCode?: string;
    phone?: string;
    referenceSource?: string;
    internalNote?: string;
    initialAccountStatus?: string;
    companyName?: string;
    companyNationalId?: string;
    companyEconomicId?: string;
    contactName?: string;
    contactTitle?: string;
    secondaryMobile?: string;
    workPhone?: string;
    fax?: string;
    workAddress?: string;
    contactNotes?: string;
    province?: string;
    city?: string;
  }): Promise<StaffCustomer> {
    return request('/customers/registration', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  getAccount(customerId: string): Promise<StaffAccount> {
    return request(`/customers/${customerId}/account`);
  },
  grantCredit(
    customerId: string,
    input: { pool: 'RIAL' | 'GOLD_RIAL'; amount: string; reason: string },
  ): Promise<StaffAccount> {
    return request(`/customers/${customerId}/account/credit`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export const internalKycApi = {
  getDocuments(customerId: string, withUrls = false): Promise<KycDocumentRecord[]> {
    return request<KycDocumentRecord[]>(
      `/customers/${customerId}/documents${toQuery({ withUrls })}`,
    ).then((docs) =>
      docs.map((doc) => ({
        ...doc,
        verificationStatus: doc.verificationStatus || doc.status || 'PENDING',
      })),
    );
  },
  getDocumentFile(customerId: string, documentId: string): Promise<Blob> {
    return fetchBlob(`/customers/${customerId}/documents/${documentId}/file`);
  },
  decideDocument(
    customerId: string,
    documentId: string,
    decision: 'APPROVE' | 'REJECT',
    reason?: string,
  ): Promise<unknown> {
    return request(`/customers/${customerId}/documents/${documentId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },
  startReview(customerId: string): Promise<unknown> {
    return request(`/customers/${customerId}/kyc/review`, { method: 'POST' });
  },
  decide(customerId: string, decision: 'APPROVE' | 'REJECT', reason?: string): Promise<unknown> {
    return request(`/customers/${customerId}/kyc/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    });
  },
  history(customerId: string): Promise<KycHistoryRecord[]> {
    return request(`/customers/${customerId}/kyc/history`);
  },
};

export const internalOrdersApi = {
  list(params: {
    status?: string;
    customerId?: string;
    page?: number;
    limit?: number;
  }): Promise<StaffOrderList> {
    return request(`/orders${toQuery(params)}`);
  },
  getById(id: string): Promise<StaffOrder> {
    return request(`/orders/${id}`);
  },
  quotations(orderId: string): Promise<StaffQuotation[]> {
    return request(`/orders/${orderId}/quotations`);
  },
  approve(id: string, notes?: string): Promise<StaffOrder> {
    return request(`/orders/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  },
  reject(id: string, reason: string): Promise<StaffOrder> {
    return request(`/orders/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  requestRevision(id: string, reason: string): Promise<StaffOrder> {
    return request(`/orders/${id}/request-revision`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

export const internalQuotationsApi = {
  list(params?: { page?: number; limit?: number }): Promise<StaffQuotationList> {
    return request(`/quotations${toQuery(params ?? {})}`);
  },
  getById(id: string): Promise<StaffQuotation> {
    return request(`/quotations/${id}`);
  },
  download(id: string): Promise<QuotationDownload> {
    return request(`/quotations/${id}/download`);
  },
};

export const assignmentsApi = {
  list(params: { page?: number; limit?: number; status?: string }): Promise<AssignmentList> {
    return request(`/assignments${toQuery(params)}`);
  },
  assign(orderId: string, input: { assignedToUserId: string; notes?: string }): Promise<AssignmentRecord> {
    return request(`/orders/${orderId}/assign`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  startReview(orderId: string): Promise<{ message: string; orderId: string }> {
    return request(`/orders/${orderId}/start-review`, { method: 'POST' });
  },
  reviewContext(orderId: string): Promise<ReviewContext> {
    return request(`/orders/${orderId}/review-context`);
  },
};

export const internalTradesApi = {
  list(params?: { status?: string; page?: number; limit?: number }): Promise<StaffTradeList> {
    return request(`/trades${toQuery(params ?? {})}`);
  },
  getById(id: string): Promise<StaffTrade> {
    return request(`/trades/${id}`);
  },
  confirm(input: { orderId: string; notes?: string }): Promise<StaffTrade> {
    return request('/trades', { method: 'POST', body: JSON.stringify(input) });
  },
  reverse(id: string, reason: string): Promise<StaffTrade> {
    return request(`/trades/${id}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

export const internalPaymentsApi = {
  list(params?: {
    tradeId?: string;
    customerId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: StaffPayment[]; meta: PaginationMeta }> {
    return request(`/payments${toQuery(params ?? {})}`);
  },
  getById(id: string): Promise<StaffPayment> {
    return request(`/payments/${id}`);
  },
  tradeStatus(tradeId: string): Promise<TradePaymentStatus> {
    return request(`/payments/trade/${tradeId}`);
  },
  record(input: {
    idempotencyKey: string;
    tradeId: string;
    method: string;
    amount: string;
    referenceNumber?: string;
    notes?: string;
    receivedAt?: string;
  }): Promise<{ payment: StaffPayment; wasAlreadyRecorded: boolean }> {
    return request('/payments', { method: 'POST', body: JSON.stringify(input) });
  },
  validate(id: string): Promise<StaffPayment> {
    return request(`/payments/${id}/validate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  allocate(id: string, input: { tradeId: string; amount: string }): Promise<unknown> {
    return request(`/payments/${id}/allocate`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

export const internalSettlementsApi = {
  getByTrade(tradeId: string): Promise<StaffSettlement> {
    return request(`/settlements/trade/${tradeId}`);
  },
  getById(id: string): Promise<StaffSettlement> {
    return request(`/settlements/${id}`);
  },
};

export const suppliersApi = {
  list(params?: { status?: string; limit?: number; offset?: number }): Promise<SupplierRecord[]> {
    return request(`/suppliers${toQuery(params ?? {})}`);
  },
  getById(id: string): Promise<SupplierRecord> {
    return request(`/suppliers/${id}`);
  },
  create(input: {
    name: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    notes?: string;
  }): Promise<SupplierRecord> {
    return request('/suppliers', { method: 'POST', body: JSON.stringify(input) });
  },
  account(id: string): Promise<SupplierAccountRecord> {
    return request(`/suppliers/${id}/account`);
  },
};

export const purchasesApi = {
  list(params?: {
    supplierId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<PurchaseRecord[]> {
    return request(`/purchases${toQuery(params ?? {})}`);
  },
  getById(id: string): Promise<PurchaseRecord> {
    return request(`/purchases/${id}`);
  },
  create(input: {
    idempotencyKey: string;
    supplierId: string;
    settlementType: string;
    purchaseDate: string;
    totalAmountRial: string;
    weightGrams: string;
    purityRatio: string;
    pricePerGramRial: string;
    supplierReference?: string;
    notes?: string;
  }): Promise<PurchaseRecord> {
    return request('/purchases', { method: 'POST', body: JSON.stringify(input) });
  },
  confirm(id: string): Promise<PurchaseRecord> {
    return request(`/purchases/${id}/confirm`, { method: 'POST' });
  },
  cancel(id: string, reason: string): Promise<PurchaseRecord> {
    return request(`/purchases/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
};

export const financialLedgerApi = {
  journals(params?: { limit?: number; offset?: number; sourceType?: string }): Promise<LedgerJournalList> {
    return request(`/ledger/financial/journals${toQuery(params ?? {})}`);
  },
  accounts(): Promise<LedgerAccount[]> {
    return request('/ledger/financial/accounts');
  },
  balances(): Promise<AccountBalance[]> {
    return request('/ledger/financial/balances');
  },
};

export const goldLedgerApi = {
  journals(params?: { limit?: number; offset?: number; sourceType?: string }): Promise<GoldJournalList> {
    return request(`/ledger/gold/journals${toQuery(params ?? {})}`);
  },
  accounts(): Promise<LedgerAccount[]> {
    return request('/ledger/gold/accounts');
  },
  balances(): Promise<GoldBalance[]> {
    return request('/ledger/gold/balances');
  },
};

export const reportsApi = {
  dashboard(): Promise<DashboardSummary> {
    return request('/reports/dashboard');
  },
  customers(query: ReportQuery = {}): Promise<CustomerReport> {
    return request(`/reports/customers${toQuery(query)}`);
  },
  orders(query: ReportQuery = {}): Promise<OrderReport> {
    return request(`/reports/orders${toQuery(query)}`);
  },
  trades(query: ReportQuery = {}): Promise<TradeReport> {
    return request(`/reports/trades${toQuery(query)}`);
  },
  payments(query: ReportQuery = {}): Promise<PaymentReport> {
    return request(`/reports/payments${toQuery(query)}`);
  },
  settlements(query: ReportQuery = {}): Promise<SettlementReport> {
    return request(`/reports/settlements${toQuery(query)}`);
  },
  financial(query: ReportQuery = {}): Promise<FinancialReport> {
    return request(`/reports/financial${toQuery(query)}`);
  },
  gold(query: ReportQuery = {}): Promise<GoldReport> {
    return request(`/reports/gold${toQuery(query)}`);
  },
  suppliers(query: ReportQuery = {}): Promise<SupplierReport> {
    return request(`/reports/suppliers${toQuery(query)}`);
  },
  purchases(query: ReportQuery = {}): Promise<PurchaseReport> {
    return request(`/reports/purchases${toQuery(query)}`);
  },
  pricing(query: ReportQuery = {}): Promise<PricingReport> {
    return request(`/reports/pricing${toQuery(query)}`);
  },
  audit(query: ReportQuery = {}): Promise<AuditReport> {
    return request(`/reports/audit${toQuery(query)}`);
  },
};

export const staffNotificationsApi = {
  list(params?: { limit?: number; offset?: number }): Promise<StaffNotification[]> {
    return request(`/notifications${toQuery({ view: 'delivery', ...params })}`);
  },
};

export function tradesFromList(result: StaffTradeList | null | undefined): StaffTrade[] {
  return result?.trades ?? [];
}

export type SessionLimitType = 'LIMITED' | 'UNLIMITED';
export type SessionLoginBehavior = 'BLOCK' | 'REVOKE_OLDEST' | 'REQUIRE_CONFIRMATION';
export type UserSessionPolicyMode = 'INHERIT' | 'CUSTOM';

export interface SessionPolicyFields {
  limitType: SessionLimitType;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior;
}

export interface RoleSessionPolicyRow {
  roleId: string;
  name: string;
  description: string | null;
  useDefault: boolean;
  limitType: SessionLimitType | null;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior | null;
}

export interface UserSessionPolicyView {
  user: { id: string; name: string; mobile: string };
  mode: UserSessionPolicyMode;
  limitType: SessionLimitType | null;
  maxSessions: number | null;
  loginBehavior: SessionLoginBehavior | null;
  effective: SessionPolicyFields & { source: 'user' | 'role' | 'global' };
}

export interface SessionUserHit {
  id: string;
  name: string;
  mobile: string;
  status: string;
  roles: Array<{ id: string; name: string; description: string | null }>;
}

export const sessionPolicyApi = {
  getGlobal(): Promise<SessionPolicyFields> {
    return request('/session-policies/global');
  },
  updateGlobal(body: SessionPolicyFields): Promise<SessionPolicyFields> {
    return request('/session-policies/global', { method: 'PATCH', body: JSON.stringify(body) });
  },
  listRoles(): Promise<RoleSessionPolicyRow[]> {
    return request('/session-policies/roles');
  },
  updateRole(
    roleId: string,
    body: {
      useDefault: boolean;
      limitType?: SessionLimitType;
      maxSessions?: number | null;
      loginBehavior?: Exclude<SessionLoginBehavior, 'REQUIRE_CONFIRMATION'>;
    },
  ): Promise<RoleSessionPolicyRow> {
    return request(`/session-policies/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  searchUsers(mobile: string): Promise<SessionUserHit[]> {
    return request(`/session-policies/users/search${toQuery({ mobile })}`);
  },
  getUser(userId: string): Promise<UserSessionPolicyView> {
    return request(`/session-policies/users/${userId}`);
  },
  updateUser(
    userId: string,
    body: {
      mode: UserSessionPolicyMode;
      limitType?: SessionLimitType;
      maxSessions?: number | null;
      loginBehavior?: Exclude<SessionLoginBehavior, 'REQUIRE_CONFIRMATION'>;
    },
  ): Promise<UserSessionPolicyView> {
    return request(`/session-policies/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  listUserSessions(userId: string): Promise<import('./api').AuthSession[]> {
    return request(`/users/${userId}/sessions`);
  },
  revokeUserSession(userId: string, sessionId: string): Promise<{ revoked: boolean }> {
    return request(`/users/${userId}/sessions/${sessionId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },
  revokeUserSessions(userId: string): Promise<{ revokedCount: number }> {
    return request(`/users/${userId}/sessions/revoke-others`, {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },
};

export interface TradingMeter {
  used: string | number;
  max: string | number | null;
  remaining: string | number | null;
  percent: number | null;
}

export interface TradingSessionView {
  id: string;
  title: string;
  weekday: string | null;
  weekdayLabel: string | null;
  dayOverrideId: string | null;
  startTime: string;
  endTime: string;
  enabled: boolean;
  status: string | null;
  maxAmountRial: string | null;
  minAmountRial: string | null;
  maxWeightGrams: string | null;
  minWeightGrams: string | null;
  maxCount: number | null;
  maxSingleAmountRial: string | null;
  maxSingleWeightGrams: string | null;
  usedAmountRial: string | null;
  usedWeightGrams: string | null;
  usedCount: number | null;
  remainingAmountRial: string | null;
  remainingWeightGrams: string | null;
  remainingCount: number | null;
  amountPercent: number | null;
  weightPercent: number | null;
  countPercent: number | null;
}

export interface TradingMarker {
  id: string;
  date: string;
  kind: 'FULL_CLOSURE' | 'SPECIAL_SCHEDULE';
  title: string;
  enabled: boolean;
  sessions: TradingSessionView[];
}

export interface TradingOverview {
  status: string;
  open: boolean;
  scheduleEnabled: boolean;
  holidayTitle: string | null;
  serverTime: string;
  today: {
    date: string;
    weekday: string;
    weekdayLabel: string;
    special: boolean;
    sessions: TradingSessionView[];
  };
  summary: { count: TradingMeter; weight: TradingMeter; amount: TradingMeter };
  currentLimits: {
    sessionId: string;
    title: string;
    status: string;
    startTime: string;
    endTime: string;
    count: TradingMeter;
    weight: TradingMeter;
    amount: TradingMeter;
  } | null;
  weekly: Array<{ weekday: string; label: string; sessions: TradingSessionView[] }>;
  markers: TradingMarker[];
}

export interface TradingAuditPage {
  total: number;
  items: Array<{
    id: string;
    actorId: string | null;
    actorName: string | null;
    actorMobile: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
    timestamp: string;
  }>;
}

export interface TradingSessionBody {
  title?: string;
  weekday?: string | null;
  dayOverrideId?: string | null;
  startTime?: string;
  endTime?: string;
  enabled?: boolean;
  maxAmountRial?: string | null;
  minAmountRial?: string | null;
  maxWeightGrams?: string | null;
  minWeightGrams?: string | null;
  maxCount?: number | null;
  maxSingleAmountRial?: string | null;
  maxSingleWeightGrams?: string | null;
}

export interface TradingOverrideBody {
  date: string;
  kind: 'FULL_CLOSURE' | 'SPECIAL_SCHEDULE';
  title: string;
  enabled: boolean;
  startTime?: string | null;
  endTime?: string | null;
}

export const tradingApi = {
  overview(params: { from?: string; to?: string } = {}): Promise<TradingOverview> {
    return request(`/trading/overview${toQuery(params)}`);
  },
  createSession(body: TradingSessionBody): Promise<TradingSessionView> {
    return request('/trading/sessions', { method: 'POST', body: JSON.stringify(body) });
  },
  updateSession(id: string, body: TradingSessionBody): Promise<TradingSessionView> {
    return request(`/trading/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteSession(id: string): Promise<{ id: string }> {
    return request(`/trading/sessions/${id}`, { method: 'DELETE' });
  },
  copySession(id: string, weekdays: string[]): Promise<TradingSessionView[]> {
    return request(`/trading/sessions/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify({ weekdays }),
    });
  },
  createOverride(body: TradingOverrideBody): Promise<TradingMarker> {
    return request('/trading/overrides', { method: 'POST', body: JSON.stringify(body) });
  },
  updateOverride(id: string, body: TradingOverrideBody): Promise<TradingMarker> {
    return request(`/trading/overrides/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  deleteOverride(id: string): Promise<{ id: string }> {
    return request(`/trading/overrides/${id}`, { method: 'DELETE' });
  },
  upsertLimit(body: TradingSessionBody & { sessionId: string; scope: string; scopeKey?: string | null; enabled?: boolean }) {
    return request('/trading/limits', { method: 'PUT', body: JSON.stringify(body) });
  },
  audit(params: { limit?: number; offset?: number } = {}): Promise<TradingAuditPage> {
    return request(`/trading/audit${toQuery(params)}`);
  },
};
