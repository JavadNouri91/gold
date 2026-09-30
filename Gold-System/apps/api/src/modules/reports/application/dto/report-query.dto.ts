/**
 * Report query filter objects
 *
 * All date fields are ISO-8601 strings; the service validates and parses them.
 * Pagination uses limit/offset (not cursor-based) — appropriate for this data size.
 */

export class DateRangeQuery {
  /** ISO-8601 start date (inclusive) */
  from?: string;
  /** ISO-8601 end date (inclusive) */
  to?: string;
}

export class PaginationQuery {
  limit?: number; // default 50
  offset?: number; // default 0
}

export class CustomerReportQuery extends DateRangeQuery {
  type?: string; // CustomerType
  status?: string; // CustomerStatus
  limit?: number;
  offset?: number;
}

export class OrderReportQuery extends DateRangeQuery {
  status?: string; // OrderStatus
  customerId?: string;
  customerType?: string;
  limit?: number;
  offset?: number;
}

export class TradeReportQuery extends DateRangeQuery {
  status?: string;
  customerId?: string;
  customerType?: string;
  limit?: number;
  offset?: number;
}

export class PaymentReportQuery extends DateRangeQuery {
  method?: string; // PaymentMethod
  status?: string;
  tradeId?: string;
  limit?: number;
  offset?: number;
}

export class FinancialReportQuery extends DateRangeQuery {
  accountCode?: string; // FA-01 … FA-15
  sourceType?: string;
  limit?: number;
  offset?: number;
}

export class GoldReportQuery extends DateRangeQuery {
  accountCode?: string; // GA-01 | GA-02 | GA-03
  direction?: string; // IN | OUT
  limit?: number;
  offset?: number;
}

export class SupplierReportQuery extends DateRangeQuery {
  supplierId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export class AuditReportQuery extends DateRangeQuery {
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}
