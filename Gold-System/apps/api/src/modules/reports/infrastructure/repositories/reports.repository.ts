import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../../database/prisma.service';
import {
  CustomerReportQuery,
  OrderReportQuery,
  TradeReportQuery,
  PaymentReportQuery,
  FinancialReportQuery,
  GoldReportQuery,
  SupplierReportQuery,
  AuditReportQuery,
} from '../../application/dto/report-query.dto';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to + 'T23:59:59.999Z') }),
  };
}

function pageArgs(limit?: number, offset?: number) {
  return {
    take: Math.min(limit ?? 50, 500),
    skip: offset ?? 0,
  };
}

// ─── Repository ──────────────────────────────────────────────────────────────

@Injectable()
export class ReportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard helpers (fast counts — no pagination)
  // ─────────────────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalCustomers,
      customersByType,
      pendingKyc,
      activeCustomers,
      suspendedCustomers,
      ordersByStatus,
      tradesByStatus,
      tradeAgg,
      paymentAgg,
      paymentCount,
      settledTrades,
      unsettledTrades,
      recentTrades,
      recentPayments,
      totalSuppliers,
      activeSuppliers,
      purchasesByStatus,
      purchaseAgg,
    ] = await Promise.all([
      this.prisma.customer.count(),

      this.prisma.customer.groupBy({ by: ['type'], _count: { id: true } }),

      this.prisma.kYCVerification.count({ where: { status: 'PENDING' } }),

      this.prisma.customer.count({ where: { status: 'ACTIVE' } }),

      this.prisma.customer.count({ where: { status: 'SUSPENDED' } }),

      this.prisma.order.groupBy({ by: ['status'], _count: { id: true } }),

      this.prisma.trade.groupBy({ by: ['status'], _count: { id: true } }),

      this.prisma.trade.aggregate({
        _sum: { totalAmountRial: true, weightGrams: true },
        where: { status: { not: 'REVERSED' } },
      }),

      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: { not: 'REVERSED' } },
      }),

      this.prisma.payment.count({
        where: { status: { not: 'REVERSED' } },
      }),

      this.prisma.settlement.count({ where: { status: 'SETTLED' } }),

      this.prisma.settlement.count({ where: { status: { not: 'SETTLED' } } }),

      this.prisma.trade.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          tradeNumber: true,
          status: true,
          totalAmountRial: true,
          weightGrams: true,
          confirmedAt: true,
          createdAt: true,
        },
      }),

      this.prisma.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          tradeId: true,
          method: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),

      this.prisma.supplier.count(),

      this.prisma.supplier.count({ where: { status: 'ACTIVE' } }),

      this.prisma.purchase.groupBy({ by: ['status'], _count: { id: true } }),

      this.prisma.purchase.aggregate({
        _sum: { totalAmountRial: true },
      }),
    ]);

    return {
      totalCustomers,
      customersByType,
      pendingKyc,
      activeCustomers,
      suspendedCustomers,
      ordersByStatus,
      tradesByStatus,
      tradeAgg,
      paymentAgg,
      paymentCount,
      settledTrades,
      unsettledTrades,
      recentTrades,
      recentPayments,
      totalSuppliers,
      activeSuppliers,
      purchasesByStatus,
      purchaseAgg,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard: financial balances (from ledger)
  // ─────────────────────────────────────────────────────────────────────────

  async getFinancialAccountBalance(
    accountCode: string,
  ): Promise<{ totalDebit: Decimal; totalCredit: Decimal }> {
    const agg = await this.prisma.financialLedgerEntry.aggregate({
      where: { accountCode },
      _sum: { debit: true, credit: true },
    });
    return {
      totalDebit: new Decimal(agg._sum.debit?.toString() ?? '0'),
      totalCredit: new Decimal(agg._sum.credit?.toString() ?? '0'),
    };
  }

  async getGoldAccountBalance(
    accountCode: string,
  ): Promise<{ totalIn: Decimal; totalOut: Decimal }> {
    const [inAgg, outAgg] = await Promise.all([
      this.prisma.goldLedgerEntry.aggregate({
        where: { accountCode, direction: 'IN' },
        _sum: { quantity: true },
      }),
      this.prisma.goldLedgerEntry.aggregate({
        where: { accountCode, direction: 'OUT' },
        _sum: { quantity: true },
      }),
    ]);
    return {
      totalIn: new Decimal(inAgg._sum.quantity?.toString() ?? '0'),
      totalOut: new Decimal(outAgg._sum.quantity?.toString() ?? '0'),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Customer report
  // ─────────────────────────────────────────────────────────────────────────

  async getCustomerReport(query: CustomerReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.type && { type: query.type as never }),
      ...(query.status && { status: query.status as never }),
    };

    const [total, byType, byStatus, pendingKyc, customers] = await Promise.all([
      this.prisma.customer.count({ where }),

      this.prisma.customer.groupBy({ by: ['type'], where, _count: { id: true } }),

      this.prisma.customer.groupBy({ by: ['status'], where, _count: { id: true } }),

      this.prisma.kYCVerification.count({ where: { status: 'PENDING' } }),

      this.prisma.customer.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          kycVerifications: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          account: {
            select: {
              creditLimitRial: true,
              consumedCreditRial: true,
              reservedCreditRial: true,
            },
          },
        },
      }),
    ]);

    return { total, byType, byStatus, pendingKyc, customers };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Order report
  // ─────────────────────────────────────────────────────────────────────────

  async getOrderReport(query: OrderReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.status && { status: query.status as never }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.customerType && { customerType: query.customerType as never }),
    };

    const [total, byStatus, valueAgg, orders] = await Promise.all([
      this.prisma.order.count({ where }),

      this.prisma.order.groupBy({ by: ['status'], where, _count: { id: true } }),

      this.prisma.order.aggregate({
        where,
        _sum: { totalAmountRial: true },
      }),

      this.prisma.order.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { customerNumber: true } },
        },
      }),
    ]);

    return { total, byStatus, valueAgg, orders };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trade report
  // ─────────────────────────────────────────────────────────────────────────

  async getTradeReport(query: TradeReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.status && { status: query.status as never }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.customerType && { customerType: query.customerType }),
    };

    const [total, byStatus, valueAgg, trades] = await Promise.all([
      this.prisma.trade.count({ where }),

      this.prisma.trade.groupBy({ by: ['status'], where, _count: { id: true } }),

      this.prisma.trade.aggregate({
        where,
        _sum: { totalAmountRial: true, weightGrams: true },
      }),

      this.prisma.trade.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tradeNumber: true,
          customerId: true,
          status: true,
          totalAmountRial: true,
          weightGrams: true,
          purityRatio: true,
          customerType: true,
          confirmedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, byStatus, valueAgg, trades };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Payment report
  // ─────────────────────────────────────────────────────────────────────────

  async getPaymentReport(query: PaymentReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.status && { status: query.status as never }),
      ...(query.method && { method: query.method as never }),
      ...(query.tradeId && { tradeId: query.tradeId }),
    };

    const [total, byStatus, byMethod, valueAgg, payments] = await Promise.all([
      this.prisma.payment.count({ where }),

      this.prisma.payment.groupBy({ by: ['status'], where, _count: { id: true } }),

      this.prisma.payment.groupBy({
        by: ['method'],
        where,
        _sum: { amount: true },
      }),

      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
      }),

      this.prisma.payment.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tradeId: true,
          customerId: true,
          method: true,
          amount: true,
          status: true,
          referenceNumber: true,
          createdAt: true,
        },
      }),
    ]);

    return { total, byStatus, byMethod, valueAgg, payments };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement report
  // ─────────────────────────────────────────────────────────────────────────

  async getSettlementReport(query: PaymentReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.tradeId && { tradeId: query.tradeId }),
    };

    const [totalSettled, totalPending, settledAgg, pendingAgg, settlements] = await Promise.all([
      this.prisma.settlement.count({ where: { ...where, status: 'SETTLED' } }),

      this.prisma.settlement.count({ where: { ...where, status: { not: 'SETTLED' } } }),

      this.prisma.settlement.aggregate({
        where: { ...where, status: 'SETTLED' },
        _sum: { settledAmount: true },
      }),

      this.prisma.settlement.aggregate({
        where: { ...where, status: { not: 'SETTLED' } },
        _sum: { settledAmount: true },
      }),

      this.prisma.settlement.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          tradeId: true,
          status: true,
          settledAmount: true,
          createdAt: true,
        },
      }),
    ]);

    return { totalSettled, totalPending, settledAgg, pendingAgg, settlements };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial ledger report
  // ─────────────────────────────────────────────────────────────────────────

  async getFinancialReport(query: FinancialReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const entryWhere = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.accountCode && { accountCode: query.accountCode }),
    };
    const journalWhere = query.sourceType ? { sourceType: query.sourceType } : undefined;

    // Account balances — not affected by date range (reflect total ledger state)
    const accountCodeFilter = query.accountCode ? { accountCode: query.accountCode } : undefined;

    const [accountBalances, totalEntries, entries] = await Promise.all([
      this.prisma.financialLedgerEntry.groupBy({
        by: ['accountCode', 'accountName', 'accountType'],
        where: accountCodeFilter,
        _sum: { debit: true, credit: true },
        orderBy: { accountCode: 'asc' },
      }),

      this.prisma.financialLedgerEntry.count({
        where: {
          ...entryWhere,
          ...(journalWhere && { journal: journalWhere }),
        },
      }),

      this.prisma.financialLedgerEntry.findMany({
        where: {
          ...entryWhere,
          ...(journalWhere && { journal: journalWhere }),
        },
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          journal: { select: { sourceType: true, sourceId: true } },
        },
      }),
    ]);

    return { accountBalances, totalEntries, entries };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gold ledger report
  // ─────────────────────────────────────────────────────────────────────────

  async getGoldReport(query: GoldReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const entryWhere = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.accountCode && { accountCode: query.accountCode }),
      ...(query.direction && { direction: query.direction }),
    };

    const accountCodeFilter = query.accountCode ? { accountCode: query.accountCode } : undefined;

    const [inBalances, outBalances, totalEntries, entries] = await Promise.all([
      this.prisma.goldLedgerEntry.groupBy({
        by: ['accountCode', 'accountName'],
        where: { ...accountCodeFilter, direction: 'IN' },
        _sum: { quantity: true },
        orderBy: { accountCode: 'asc' },
      }),

      this.prisma.goldLedgerEntry.groupBy({
        by: ['accountCode', 'accountName'],
        where: { ...accountCodeFilter, direction: 'OUT' },
        _sum: { quantity: true },
        orderBy: { accountCode: 'asc' },
      }),

      this.prisma.goldLedgerEntry.count({ where: entryWhere }),

      this.prisma.goldLedgerEntry.findMany({
        where: entryWhere,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          journal: { select: { sourceType: true, sourceId: true } },
        },
      }),
    ]);

    return { inBalances, outBalances, totalEntries, entries };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Supplier report
  // ─────────────────────────────────────────────────────────────────────────

  async getSupplierReport(query: SupplierReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.supplierId && { id: query.supplierId }),
      ...(query.status && { status: query.status as never }),
    };

    const [total, active, suspended, purchaseAgg, suppliers] = await Promise.all([
      this.prisma.supplier.count({ where }),

      this.prisma.supplier.count({ where: { ...where, status: 'ACTIVE' } }),

      this.prisma.supplier.count({ where: { ...where, status: 'SUSPENDED' } }),

      this.prisma.purchase.aggregate({ _sum: { totalAmountRial: true } }),

      this.prisma.supplier.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            select: {
              totalPaidRial: true,
            },
          },
          purchases: {
            select: { totalAmountRial: true, status: true },
          },
        },
      }),
    ]);

    return { total, active, suspended, purchaseAgg, suppliers };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Purchase report
  // ─────────────────────────────────────────────────────────────────────────

  async getPurchaseReport(query: SupplierReportQuery) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(createdAtFilter && { createdAt: createdAtFilter }),
      ...(query.supplierId && { supplierId: query.supplierId }),
      ...(query.status && { status: query.status as never }),
    };

    const [total, byStatus, valueAgg, purchases] = await Promise.all([
      this.prisma.purchase.count({ where }),

      this.prisma.purchase.groupBy({ by: ['status'], where, _count: { id: true } }),

      this.prisma.purchase.aggregate({
        where,
        _sum: { totalAmountRial: true, weightGrams: true },
      }),

      this.prisma.purchase.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { name: true } },
        },
      }),
    ]);

    return { total, byStatus, valueAgg, purchases };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pricing report
  // ─────────────────────────────────────────────────────────────────────────

  async getPricingReport(query: { from?: string; to?: string; limit?: number; offset?: number }) {
    const createdAtFilter = buildDateFilter(query.from, query.to);
    const snapshotWhere = createdAtFilter ? { capturedAt: createdAtFilter } : undefined;
    const calcWhere = createdAtFilter ? { calculatedAt: createdAtFilter } : undefined;

    const [totalSnapshots, snapshots, totalCalcs, calculations] = await Promise.all([
      this.prisma.priceSnapshot.count({ where: snapshotWhere }),

      this.prisma.priceSnapshot.findMany({
        where: snapshotWhere,
        ...pageArgs(query.limit, query.offset),
        orderBy: { capturedAt: 'desc' },
        select: {
          id: true,
          rawValue: true,
          normalizedValue: true,
          capturedAt: true,
          validityStatus: true,
        },
      }),

      this.prisma.pricingCalculation.count({ where: calcWhere }),

      this.prisma.pricingCalculation.findMany({
        where: calcWhere,
        ...pageArgs(query.limit, query.offset),
        orderBy: { calculatedAt: 'desc' },
        select: {
          id: true,
          referenceType: true,
          referenceId: true,
          step1BasePrice: true,
          finalPrice: true,
          calculatedAt: true,
        },
      }),
    ]);

    return { totalSnapshots, snapshots, totalCalcs, calculations };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audit report
  // ─────────────────────────────────────────────────────────────────────────

  async getAuditReport(query: AuditReportQuery) {
    const timestampFilter = buildDateFilter(query.from, query.to);
    const where = {
      ...(timestampFilter && { timestamp: timestampFilter }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.action && { action: query.action }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
    };

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),

      this.prisma.auditLog.findMany({
        where,
        ...pageArgs(query.limit, query.offset),
        orderBy: { timestamp: 'desc' },
        select: {
          id: true,
          actorId: true,
          actorType: true,
          action: true,
          entityType: true,
          entityId: true,
          before: true,
          after: true,
          reason: true,
          ipAddress: true,
          timestamp: true,
        },
      }),
    ]);

    return { total, logs };
  }
}
