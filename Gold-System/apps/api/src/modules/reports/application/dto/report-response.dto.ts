import Decimal from 'decimal.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function decimalToString(d: Decimal | null | undefined): string | null {
  if (!d) return null;
  return d.toFixed(2);
}

export function decimalTo6(d: Decimal | null | undefined): string | null {
  if (!d) return null;
  return d.toFixed(6);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export class DashboardSummaryDto {
  // ── Customers ──────────────────────────────────────────────────────────────
  totalCustomers: number;
  customersByType: Record<string, number>;
  pendingKyc: number;
  activeCustomers: number;
  suspendedCustomers: number;

  // ── Orders ──────────────────────────────────────────────────────────────────
  pendingOrders: number;
  ordersAwaitingReview: number;
  ordersApproved: number;
  ordersRejected: number;
  ordersCancelled: number;
  ordersTotal: number;

  // ── Trades ──────────────────────────────────────────────────────────────────
  confirmedTrades: number;
  completedTrades: number;
  reversedTrades: number;
  totalTradeValueRial: string | null;
  totalTradeWeightGrams: string | null;

  // ── Payments / Settlement ───────────────────────────────────────────────────
  totalPaymentsRecorded: number;
  totalPaymentsValueRial: string | null;
  settledTrades: number;
  unsettledTrades: number;

  // ── Financial (ledger-derived) ──────────────────────────────────────────────
  /** FA-03 balance: amount store owes to suppliers */
  supplierPayableRial: string | null;
  /** FA-06 balance: total sales revenue posted */
  salesRevenueRial: string | null;
  /** FA-08 balance: total purchase cost */
  purchaseCostRial: string | null;

  // ── Gold (ledger-derived) ───────────────────────────────────────────────────
  /** GA-01 net: store gold position in grams */
  goldPositionGrams: string | null;
  /** GA-02 net: gold obligation to customers */
  goldObligationGrams: string | null;

  // ── Suppliers ───────────────────────────────────────────────────────────────
  totalSuppliers: number;
  activeSuppliers: number;
  totalPurchasedRial: string | null;
  pendingPurchases: number;
  confirmedPurchases: number;

  // ── Recent activity ─────────────────────────────────────────────────────────
  recentTrades: RecentTradeDto[];
  recentPayments: RecentPaymentDto[];
}

export class RecentTradeDto {
  id: string;
  tradeNumber: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  confirmedAt: string | null;
  createdAt: string;
}

export class RecentPaymentDto {
  id: string;
  tradeId: string;
  method: string;
  amount: string;
  status: string;
  createdAt: string;
}

// ─── Customer Report ─────────────────────────────────────────────────────────

export class CustomerReportDto {
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

export class CustomerSummaryDto {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  pendingKyc: number;
  customers: CustomerReportDto[];
}

// ─── Order Report ────────────────────────────────────────────────────────────

export class OrderReportDto {
  id: string;
  orderNumber: string;
  customerId: string;
  customerNumber: string | null;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  customerType: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export class OrderSummaryDto {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  orders: OrderReportDto[];
}

// ─── Trade Report ────────────────────────────────────────────────────────────

export class TradeReportDto {
  id: string;
  tradeNumber: string;
  customerId: string;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  customerType: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export class TradeSummaryDto {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  totalWeightGrams: string | null;
  trades: TradeReportDto[];
}

// ─── Payment Report ──────────────────────────────────────────────────────────

export class PaymentReportDto {
  id: string;
  tradeId: string;
  customerId: string;
  method: string;
  amount: string;
  status: string;
  referenceNumber: string | null;
  createdAt: string;
}

export class PaymentSummaryDto {
  total: number;
  byStatus: Record<string, number>;
  byMethod: Record<string, string>;
  totalValueRial: string | null;
  payments: PaymentReportDto[];
}

// ─── Settlement Report ───────────────────────────────────────────────────────

export class SettlementReportDto {
  id: string;
  tradeId: string;
  status: string;
  settledAmount: string;
  createdAt: string;
}

export class SettlementSummaryDto {
  totalSettled: number;
  totalPending: number;
  totalSettledValueRial: string | null;
  totalPendingValueRial: string | null;
  settlements: SettlementReportDto[];
}

// ─── Financial Report ────────────────────────────────────────────────────────

export class AccountBalanceDto {
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: string;
  totalCredit: string;
  /** netBalance = credit - debit for liability/revenue; debit - credit for asset/expense */
  netBalance: string;
}

export class FinancialLedgerEntryDto {
  id: string;
  journalId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  description: string | null;
  sourceType: string;
  sourceId: string;
  createdAt: string;
}

export class FinancialSummaryDto {
  accountBalances: AccountBalanceDto[];
  /** Entries (paginated) */
  entries: FinancialLedgerEntryDto[];
  totalEntries: number;
}

// ─── Gold Report ─────────────────────────────────────────────────────────────

export class GoldAccountBalanceDto {
  accountCode: string;
  accountName: string;
  netQuantityGrams: string;
  totalInGrams: string;
  totalOutGrams: string;
}

export class GoldLedgerEntryDto {
  id: string;
  journalId: string;
  accountCode: string;
  accountName: string;
  direction: string;
  quantity: string;
  purity: string;
  description: string | null;
  sourceType: string;
  sourceId: string;
  createdAt: string;
}

export class GoldSummaryDto {
  accountBalances: GoldAccountBalanceDto[];
  entries: GoldLedgerEntryDto[];
  totalEntries: number;
}

// ─── Supplier Report ─────────────────────────────────────────────────────────

export class SupplierReportDto {
  id: string;
  supplierNumber: string;
  name: string;
  status: string;
  integrationMode: string;
  totalPurchasedRial: string | null;
  totalPaidRial: string | null;
  outstandingRial: string | null;
  createdAt: string;
}

export class SupplierSummaryDto {
  total: number;
  active: number;
  suspended: number;
  totalPurchasedRial: string | null;
  suppliers: SupplierReportDto[];
}

// ─── Purchase Report ─────────────────────────────────────────────────────────

export class PurchaseReportDto {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string | null;
  status: string;
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  confirmedAt: string | null;
  createdAt: string;
}

export class PurchaseSummaryDto {
  total: number;
  byStatus: Record<string, number>;
  totalValueRial: string | null;
  totalWeightGrams: string | null;
  purchases: PurchaseReportDto[];
}

// ─── Pricing Report ──────────────────────────────────────────────────────────

export class PriceSnapshotReportDto {
  id: string;
  rawValue: string;
  normalizedValue: string;
  capturedAt: string;
  status: string;
}

export class PricingCalculationReportDto {
  id: string;
  sourceType: string;
  sourceId: string;
  basePrice: string;
  finalPrice: string;
  calculatedAt: string;
}

// ─── Audit Report ────────────────────────────────────────────────────────────

export class AuditLogReportDto {
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
}

export class AuditSummaryDto {
  total: number;
  logs: AuditLogReportDto[];
}
