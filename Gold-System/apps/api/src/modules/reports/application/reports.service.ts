import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { ReportsRepository } from '../infrastructure/repositories/reports.repository';
import {
  CustomerReportQuery,
  OrderReportQuery,
  TradeReportQuery,
  PaymentReportQuery,
  FinancialReportQuery,
  GoldReportQuery,
  SupplierReportQuery,
  AuditReportQuery,
} from './dto/report-query.dto';
import {
  DashboardSummaryDto,
  RecentTradeDto,
  RecentPaymentDto,
  CustomerReportDto,
  CustomerSummaryDto,
  OrderReportDto,
  OrderSummaryDto,
  TradeReportDto,
  TradeSummaryDto,
  PaymentReportDto,
  PaymentSummaryDto,
  SettlementReportDto,
  SettlementSummaryDto,
  FinancialLedgerEntryDto,
  FinancialSummaryDto,
  AccountBalanceDto,
  GoldSummaryDto,
  GoldAccountBalanceDto,
  GoldLedgerEntryDto,
  SupplierReportDto,
  SupplierSummaryDto,
  PurchaseReportDto,
  PurchaseSummaryDto,
  PriceSnapshotReportDto,
  PricingCalculationReportDto,
  AuditLogReportDto,
  AuditSummaryDto,
} from './dto/report-response.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toStr2(d: Decimal | { toString(): string } | null | undefined): string | null {
  if (d == null) return null;
  return new Decimal(d.toString()).toFixed(2);
}

function toStr6(d: Decimal | { toString(): string } | null | undefined): string | null {
  if (d == null) return null;
  return new Decimal(d.toString()).toFixed(6);
}

function iso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Reports Service — read-only aggregations from source-of-truth tables.
 *
 * INVARIANTS:
 * 1. NEVER writes to any business table.
 * 2. Financial data MUST come from FinancialLedger; never reconstructed from Orders/Trades.
 * 3. Gold data MUST come from GoldLedger; never reconstructed from Orders/Trades.
 * 4. All monetary/weight results are Decimal-derived strings — never floating-point.
 * 5. Do NOT invent metrics. Only surface what is stored in the DB.
 *
 * Source: Phase 8 specification.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly repo: ReportsRepository) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard
  // ─────────────────────────────────────────────────────────────────────────

  async getDashboard(): Promise<DashboardSummaryDto> {
    const stats = await this.repo.getDashboardStats();

    // Order counts
    const ordersByStatus: Record<string, number> = {};
    for (const row of stats.ordersByStatus) {
      ordersByStatus[row.status] = row._count.id;
    }

    // Trade counts
    const tradesByStatus: Record<string, number> = {};
    for (const row of stats.tradesByStatus) {
      tradesByStatus[row.status] = row._count.id;
    }

    // Customer by type
    const customersByType: Record<string, number> = {};
    for (const row of stats.customersByType) {
      customersByType[row.type ?? 'UNCLASSIFIED'] = row._count.id;
    }

    // Purchase by status
    const purchasesByStatus: Record<string, number> = {};
    for (const row of stats.purchasesByStatus) {
      purchasesByStatus[row.status] = row._count.id;
    }

    // Financial ledger: supplier payable (FA-03), sales (FA-06), purchase cost (FA-08)
    const [fa03, fa06, fa08] = await Promise.all([
      this.repo.getFinancialAccountBalance('FA-03'),
      this.repo.getFinancialAccountBalance('FA-06'),
      this.repo.getFinancialAccountBalance('FA-08'),
    ]);

    // Gold ledger: GA-01 (store position), GA-02 (customer obligation)
    const [ga01, ga02] = await Promise.all([
      this.repo.getGoldAccountBalance('GA-01'),
      this.repo.getGoldAccountBalance('GA-02'),
    ]);

    const recentTrades: RecentTradeDto[] = stats.recentTrades.map((t) => ({
      id: t.id,
      tradeNumber: t.tradeNumber,
      status: t.status,
      totalAmountRial: toStr2(t.totalAmountRial)!,
      weightGrams: toStr6(t.weightGrams)!,
      confirmedAt: iso(t.confirmedAt),
      createdAt: t.createdAt.toISOString(),
    }));

    const recentPayments: RecentPaymentDto[] = stats.recentPayments.map((p) => ({
      id: p.id,
      tradeId: p.tradeId,
      method: p.method,
      amount: toStr2(p.amount)!,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    }));

    // Supplier payable: FA-03 is a liability → credit - debit
    const supplierPayableRial = fa03.totalCredit.minus(fa03.totalDebit).toFixed(2);
    // Sales revenue: FA-06 credit - debit
    const salesRevenueRial = fa06.totalCredit.minus(fa06.totalDebit).toFixed(2);
    // Purchase cost: FA-08 debit - credit (expense)
    const purchaseCostRial = fa08.totalDebit.minus(fa08.totalCredit).toFixed(2);

    // Gold position: GA-01 IN - OUT
    const goldPositionGrams = ga01.totalIn.minus(ga01.totalOut).toFixed(6);
    // Gold obligation: GA-02 OUT - IN (what we owe)
    const goldObligationGrams = ga02.totalOut.minus(ga02.totalIn).toFixed(6);

    return {
      totalCustomers: stats.totalCustomers,
      customersByType,
      pendingKyc: stats.pendingKyc,
      activeCustomers: stats.activeCustomers,
      suspendedCustomers: stats.suspendedCustomers,

      pendingOrders: ordersByStatus['PENDING'] ?? 0,
      ordersAwaitingReview: ordersByStatus['SUBMITTED'] ?? 0,
      ordersApproved: ordersByStatus['APPROVED'] ?? 0,
      ordersRejected: ordersByStatus['REJECTED'] ?? 0,
      ordersCancelled: ordersByStatus['CANCELLED'] ?? 0,
      ordersTotal: Object.values(ordersByStatus).reduce((a, b) => a + b, 0),

      confirmedTrades: tradesByStatus['CONFIRMED'] ?? 0,
      completedTrades: tradesByStatus['SETTLED'] ?? 0,
      reversedTrades: tradesByStatus['REVERSED'] ?? 0,
      totalTradeValueRial: toStr2(stats.tradeAgg._sum.totalAmountRial),
      totalTradeWeightGrams: toStr6(stats.tradeAgg._sum.weightGrams),

      totalPaymentsRecorded: stats.paymentCount,
      totalPaymentsValueRial: toStr2(stats.paymentAgg._sum.amount),
      settledTrades: stats.settledTrades,
      unsettledTrades: stats.unsettledTrades,

      supplierPayableRial,
      salesRevenueRial,
      purchaseCostRial,

      goldPositionGrams,
      goldObligationGrams,

      totalSuppliers: stats.totalSuppliers,
      activeSuppliers: stats.activeSuppliers,
      totalPurchasedRial: toStr2(stats.purchaseAgg._sum.totalAmountRial),
      pendingPurchases: purchasesByStatus['DRAFT'] ?? 0,
      confirmedPurchases: purchasesByStatus['CONFIRMED'] ?? 0,

      recentTrades,
      recentPayments,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Customer report
  // ─────────────────────────────────────────────────────────────────────────

  async getCustomerReport(query: CustomerReportQuery): Promise<CustomerSummaryDto> {
    const data = await this.repo.getCustomerReport(query);

    const byType: Record<string, number> = {};
    for (const row of data.byType) {
      byType[row.type ?? 'UNCLASSIFIED'] = row._count.id;
    }
    const byStatus: Record<string, number> = {};
    for (const row of data.byStatus) {
      byStatus[row.status] = row._count.id;
    }

    const customers: CustomerReportDto[] = data.customers.map((c) => {
      const acct = c.account;
      const available = acct
        ? new Decimal(acct.creditLimitRial.toString())
            .minus(acct.reservedCreditRial.toString())
            .minus(acct.consumedCreditRial.toString())
            .toFixed(2)
        : null;

      return {
        id: c.id,
        customerNumber: c.customerNumber,
        firstName: c.firstName,
        lastName: c.lastName,
        mobile: c.mobile,
        type: c.type ?? null,
        status: c.status,
        kycStatus: c.kycVerifications?.[0]?.status ?? null,
        creditLimitRial: toStr2(acct?.creditLimitRial),
        consumedCreditRial: toStr2(acct?.consumedCreditRial),
        reservedCreditRial: toStr2(acct?.reservedCreditRial),
        availableCreditRial: available,
        createdAt: c.createdAt.toISOString(),
      };
    });

    return {
      total: data.total,
      byType,
      byStatus,
      pendingKyc: data.pendingKyc,
      customers,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Order report
  // ─────────────────────────────────────────────────────────────────────────

  async getOrderReport(query: OrderReportQuery): Promise<OrderSummaryDto> {
    const data = await this.repo.getOrderReport(query);

    const byStatus: Record<string, number> = {};
    for (const row of data.byStatus) {
      byStatus[row.status] = row._count.id;
    }

    const orders: OrderReportDto[] = data.orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerId: o.customerId,
      customerNumber: o.customer?.customerNumber ?? null,
      status: o.status,
      totalAmountRial: toStr2(o.totalAmountRial)!,
      weightGrams: toStr6(o.weightGrams)!,
      purityRatio: toStr6(o.purityRatio)!,
      customerType: o.customerType ?? null,
      submittedAt: iso(o.submittedAt),
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      total: data.total,
      byStatus,
      totalValueRial: toStr2(data.valueAgg._sum.totalAmountRial),
      orders,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trade report
  // ─────────────────────────────────────────────────────────────────────────

  async getTradeReport(query: TradeReportQuery): Promise<TradeSummaryDto> {
    const data = await this.repo.getTradeReport(query);

    const byStatus: Record<string, number> = {};
    for (const row of data.byStatus) {
      byStatus[row.status] = row._count.id;
    }

    const trades: TradeReportDto[] = data.trades.map((t) => ({
      id: t.id,
      tradeNumber: t.tradeNumber,
      customerId: t.customerId,
      status: t.status,
      totalAmountRial: toStr2(t.totalAmountRial)!,
      weightGrams: toStr6(t.weightGrams)!,
      purityRatio: toStr6(t.purityRatio)!,
      customerType: t.customerType ?? null,
      confirmedAt: iso(t.confirmedAt),
      createdAt: t.createdAt.toISOString(),
    }));

    return {
      total: data.total,
      byStatus,
      totalValueRial: toStr2(data.valueAgg._sum.totalAmountRial),
      totalWeightGrams: toStr6(data.valueAgg._sum.weightGrams),
      trades,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Payment report
  // ─────────────────────────────────────────────────────────────────────────

  async getPaymentReport(query: PaymentReportQuery): Promise<PaymentSummaryDto> {
    const data = await this.repo.getPaymentReport(query);

    const byStatus: Record<string, number> = {};
    for (const row of data.byStatus) {
      byStatus[row.status] = row._count.id;
    }

    const byMethod: Record<string, string> = {};
    for (const row of data.byMethod) {
      byMethod[row.method] = toStr2(row._sum.amount) ?? '0.00';
    }

    const payments: PaymentReportDto[] = data.payments.map((p) => ({
      id: p.id,
      tradeId: p.tradeId,
      customerId: p.customerId,
      method: p.method,
      amount: toStr2(p.amount)!,
      status: p.status,
      referenceNumber: p.referenceNumber ?? null,
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      total: data.total,
      byStatus,
      byMethod,
      totalValueRial: toStr2(data.valueAgg._sum.amount),
      payments,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement report
  // ─────────────────────────────────────────────────────────────────────────

  async getSettlementReport(query: PaymentReportQuery): Promise<SettlementSummaryDto> {
    const data = await this.repo.getSettlementReport(query);

    const settlements: SettlementReportDto[] = data.settlements.map((s) => ({
      id: s.id,
      tradeId: s.tradeId,
      status: s.status,
      settledAmount: toStr2(s.settledAmount)!,
      createdAt: s.createdAt.toISOString(),
    }));

    return {
      totalSettled: data.totalSettled,
      totalPending: data.totalPending,
      totalSettledValueRial: toStr2(data.settledAgg._sum.settledAmount),
      totalPendingValueRial: toStr2(data.pendingAgg._sum.settledAmount),
      settlements,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial ledger report
  // ─────────────────────────────────────────────────────────────────────────

  async getFinancialReport(query: FinancialReportQuery): Promise<FinancialSummaryDto> {
    const data = await this.repo.getFinancialReport(query);

    const accountBalances: AccountBalanceDto[] = data.accountBalances.map((row) => {
      const totalDebit = new Decimal(row._sum.debit?.toString() ?? '0');
      const totalCredit = new Decimal(row._sum.credit?.toString() ?? '0');
      // Net balance convention: ASSET/EXPENSE → debit - credit; LIABILITY/REVENUE → credit - debit
      const isDebitNormal = ['ASSET', 'EXPENSE'].includes(row.accountType);
      const netBalance = isDebitNormal
        ? totalDebit.minus(totalCredit)
        : totalCredit.minus(totalDebit);

      return {
        accountCode: row.accountCode,
        accountName: row.accountName,
        accountType: row.accountType,
        totalDebit: totalDebit.toFixed(2),
        totalCredit: totalCredit.toFixed(2),
        netBalance: netBalance.toFixed(2),
      };
    });

    const entries: FinancialLedgerEntryDto[] = data.entries.map((e) => ({
      id: e.id,
      journalId: e.journalId,
      accountCode: e.accountCode,
      accountName: e.accountName,
      accountType: e.accountType,
      debit: toStr2(e.debit)!,
      credit: toStr2(e.credit)!,
      description: e.description ?? null,
      sourceType: e.journal.sourceType,
      sourceId: e.journal.sourceId,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      accountBalances,
      entries,
      totalEntries: data.totalEntries,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gold ledger report
  // ─────────────────────────────────────────────────────────────────────────

  async getGoldReport(query: GoldReportQuery): Promise<GoldSummaryDto> {
    const data = await this.repo.getGoldReport(query);

    // Build a map from accountCode → { name, totalIn, totalOut }
    const balanceMap = new Map<
      string,
      { accountName: string; totalIn: Decimal; totalOut: Decimal }
    >();

    for (const row of data.inBalances) {
      const key = row.accountCode;
      const existing = balanceMap.get(key);
      const qty = new Decimal(row._sum.quantity?.toString() ?? '0');
      if (existing) {
        existing.totalIn = existing.totalIn.plus(qty);
      } else {
        balanceMap.set(key, {
          accountName: row.accountName,
          totalIn: qty,
          totalOut: new Decimal(0),
        });
      }
    }

    for (const row of data.outBalances) {
      const key = row.accountCode;
      const qty = new Decimal(row._sum.quantity?.toString() ?? '0');
      const existing = balanceMap.get(key);
      if (existing) {
        existing.totalOut = existing.totalOut.plus(qty);
      } else {
        balanceMap.set(key, {
          accountName: row.accountName,
          totalIn: new Decimal(0),
          totalOut: qty,
        });
      }
    }

    const accountBalances: GoldAccountBalanceDto[] = Array.from(balanceMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([code, bal]) => ({
        accountCode: code,
        accountName: bal.accountName,
        netQuantityGrams: bal.totalIn.minus(bal.totalOut).toFixed(6),
        totalInGrams: bal.totalIn.toFixed(6),
        totalOutGrams: bal.totalOut.toFixed(6),
      }));

    const entries: GoldLedgerEntryDto[] = data.entries.map((e) => ({
      id: e.id,
      journalId: e.journalId,
      accountCode: e.accountCode,
      accountName: e.accountName,
      direction: e.direction,
      quantity: toStr6(e.quantity)!,
      purity: toStr6(e.purity)!,
      description: e.description ?? null,
      sourceType: e.journal.sourceType,
      sourceId: e.journal.sourceId,
      createdAt: e.createdAt.toISOString(),
    }));

    return {
      accountBalances,
      entries,
      totalEntries: data.totalEntries,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Supplier report
  // ─────────────────────────────────────────────────────────────────────────

  async getSupplierReport(query: SupplierReportQuery): Promise<SupplierSummaryDto> {
    const data = await this.repo.getSupplierReport(query);

    const suppliers: SupplierReportDto[] = data.suppliers.map((s) => {
      const totalPurchasedRial = s.purchases
        .filter((p) => p.status === 'CONFIRMED')
        .reduce((sum, p) => sum.plus(p.totalAmountRial.toString()), new Decimal(0));

      const totalPaidRial = s.account
        ? new Decimal(s.account.totalPaidRial.toString())
        : new Decimal(0);
      const outstandingRial = totalPurchasedRial.minus(totalPaidRial);

      return {
        id: s.id,
        supplierNumber: s.supplierNumber,
        name: s.name,
        status: s.status,
        integrationMode: s.integrationMode,
        totalPurchasedRial: totalPurchasedRial.toFixed(2),
        totalPaidRial: totalPaidRial.toFixed(2),
        outstandingRial: outstandingRial.toFixed(2),
        createdAt: s.createdAt.toISOString(),
      };
    });

    return {
      total: data.total,
      active: data.active,
      suspended: data.suspended,
      totalPurchasedRial: toStr2(data.purchaseAgg._sum.totalAmountRial),
      suppliers,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Purchase report
  // ─────────────────────────────────────────────────────────────────────────

  async getPurchaseReport(query: SupplierReportQuery): Promise<PurchaseSummaryDto> {
    const data = await this.repo.getPurchaseReport(query);

    const byStatus: Record<string, number> = {};
    for (const row of data.byStatus) {
      byStatus[row.status] = row._count.id;
    }

    const purchases: PurchaseReportDto[] = data.purchases.map((p) => ({
      id: p.id,
      purchaseNumber: p.purchaseNumber,
      supplierId: p.supplierId,
      supplierName: p.supplier?.name ?? null,
      status: p.status,
      totalAmountRial: toStr2(p.totalAmountRial)!,
      weightGrams: toStr6(p.weightGrams)!,
      purityRatio: toStr6(p.purityRatio)!,
      confirmedAt: iso(p.confirmedAt),
      createdAt: p.createdAt.toISOString(),
    }));

    return {
      total: data.total,
      byStatus,
      totalValueRial: toStr2(data.valueAgg._sum.totalAmountRial),
      totalWeightGrams: toStr6(data.valueAgg._sum.weightGrams),
      purchases,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pricing report
  // ─────────────────────────────────────────────────────────────────────────

  async getPricingReport(query: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    totalSnapshots: number;
    snapshots: PriceSnapshotReportDto[];
    totalCalculations: number;
    calculations: PricingCalculationReportDto[];
  }> {
    const data = await this.repo.getPricingReport(query);

    const snapshots: PriceSnapshotReportDto[] = data.snapshots.map((s) => ({
      id: s.id,
      rawValue: toStr6(s.rawValue)!,
      normalizedValue: toStr6(s.normalizedValue)!,
      capturedAt: s.capturedAt.toISOString(),
      status: s.validityStatus,
    }));

    const calculations: PricingCalculationReportDto[] = data.calculations.map((c) => ({
      id: c.id,
      sourceType: c.referenceType ?? 'UNKNOWN',
      sourceId: c.referenceId ?? '',
      basePrice: toStr6(c.step1BasePrice)!,
      finalPrice: toStr6(c.finalPrice)!,
      calculatedAt: c.calculatedAt.toISOString(),
    }));

    return {
      totalSnapshots: data.totalSnapshots,
      snapshots,
      totalCalculations: data.totalCalcs,
      calculations,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audit report
  // ─────────────────────────────────────────────────────────────────────────

  async getAuditReport(query: AuditReportQuery): Promise<AuditSummaryDto> {
    const data = await this.repo.getAuditReport(query);

    const logs: AuditLogReportDto[] = data.logs.map((l) => ({
      id: l.id,
      actorId: l.actorId ?? null,
      actorType: l.actorType,
      action: l.action,
      entityType: l.entityType ?? null,
      entityId: l.entityId ?? null,
      before: l.before,
      after: l.after,
      reason: l.reason ?? null,
      ipAddress: l.ipAddress ?? null,
      createdAt: l.timestamp.toISOString(),
    }));

    return { total: data.total, logs };
  }
}
