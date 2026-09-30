import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';

import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { ReportsService } from '../../application/reports.service';
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

/**
 * Reports Controller
 *
 * ALL endpoints are staff-only (internal).  Customers have NO access.
 * Authorization:
 *   - financial_report.read  → /reports/financial, /reports/gold
 *   - financial_report.read  → /reports/dashboard (summary includes financial data)
 *   - reports                → all other endpoints
 *
 * This controller is READ-ONLY.  It NEVER modifies business data.
 *
 * Source: Phase 8 specification.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // Dashboard
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/dashboard
   * High-level aggregated summary across all modules.
   */
  @Get('dashboard')
  @RequirePermissions('financial_report.read')
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Customer report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/customers
   * Customer list with KYC status, credit utilisation.
   */
  @Get('customers')
  @RequirePermissions('reports')
  getCustomers(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: CustomerReportQuery = { from, to, type, status, limit, offset };
    return this.reportsService.getCustomerReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Order report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/orders
   * Order list with status breakdown and value aggregates.
   */
  @Get('orders')
  @RequirePermissions('reports')
  getOrders(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('customerType') customerType?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: OrderReportQuery = { from, to, status, customerId, customerType, limit, offset };
    return this.reportsService.getOrderReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trade report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/trades
   * Trade list with status breakdown, total value and weight aggregates.
   */
  @Get('trades')
  @RequirePermissions('reports')
  getTrades(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('customerType') customerType?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: TradeReportQuery = { from, to, status, customerId, customerType, limit, offset };
    return this.reportsService.getTradeReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Payment report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/payments
   * Payment list with method and status breakdowns.
   */
  @Get('payments')
  @RequirePermissions('financial_report.read')
  getPayments(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('method') method?: string,
    @Query('status') status?: string,
    @Query('tradeId') tradeId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: PaymentReportQuery = { from, to, method, status, tradeId, limit, offset };
    return this.reportsService.getPaymentReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/settlements
   * Settlement status breakdown with value totals.
   */
  @Get('settlements')
  @RequirePermissions('financial_report.read')
  getSettlements(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tradeId') tradeId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: PaymentReportQuery = { from, to, tradeId, limit, offset };
    return this.reportsService.getSettlementReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial ledger report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/financial
   * Account balances (from ledger) + paginated ledger entries.
   * Source of truth: FinancialLedger module.
   */
  @Get('financial')
  @RequirePermissions('financial_report.read')
  getFinancial(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountCode') accountCode?: string,
    @Query('sourceType') sourceType?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: FinancialReportQuery = { from, to, accountCode, sourceType, limit, offset };
    return this.reportsService.getFinancialReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gold ledger report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/gold
   * Gold account balances (net IN - OUT per account) + paginated entries.
   * Source of truth: GoldLedger module.
   */
  @Get('gold')
  @RequirePermissions('financial_report.read')
  getGold(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountCode') accountCode?: string,
    @Query('direction') direction?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: GoldReportQuery = { from, to, accountCode, direction, limit, offset };
    return this.reportsService.getGoldReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Supplier report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/suppliers
   * Supplier list with purchase totals and outstanding balances.
   */
  @Get('suppliers')
  @RequirePermissions('reports')
  getSuppliers(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: SupplierReportQuery = { from, to, supplierId, status, limit, offset };
    return this.reportsService.getSupplierReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Purchase report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/purchases
   * Purchase list with status and value aggregates.
   */
  @Get('purchases')
  @RequirePermissions('reports')
  getPurchases(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: SupplierReportQuery = { from, to, supplierId, status, limit, offset };
    return this.reportsService.getPurchaseReport(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pricing report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/pricing
   * Price snapshots and pricing calculations.
   */
  @Get('pricing')
  @RequirePermissions('reports')
  getPricing(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.reportsService.getPricingReport({ from, to, limit, offset });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Audit report
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /reports/audit
   * Audit log report with actor, action and entity filters.
   * Requires ledger.read (audit logs are sensitive).
   */
  @Get('audit')
  @RequirePermissions('ledger.read')
  getAudit(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const query: AuditReportQuery = {
      from,
      to,
      actorId,
      action,
      entityType,
      entityId,
      limit,
      offset,
    };
    return this.reportsService.getAuditReport(query);
  }
}
