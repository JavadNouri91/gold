export type ConnectHealthStatus =
  'CONNECTED_VALID' | 'CONNECTED_WITH_WARNINGS' | 'CONNECTION_FAILED';

export type ConnectProductDataStatus =
  'VALID' | 'PARTIAL' | 'INVALID' | 'INVALID_RESPONSE' | 'NOT_CHECKED';

export interface ProductsCheckResult {
  success: true;
  connectionStatus: 'CONNECTED_VALID' | 'CONNECTED_WITH_WARNINGS';
  httpConnected: true;
  dataValidationStatus: 'VALID' | 'PARTIAL' | 'INVALID';
  productsCount: number;
  validProductsCount: number;
  invalidProductsCount: number;
  /** Phase 1 only verifies product data; it never marks pricing as ready. */
  pricingReady: false;
  diagnostic: ConnectProductValidationDiagnostic;
  responseTimeMs: number;
}

export type ConnectProductField =
  | 'id'
  | 'title'
  | 'buy_price'
  | 'sell_price'
  | 'is_active'
  | 'is_buy_active'
  | 'is_sell_active'
  | 'data'
  | '$product';

export type ConnectPriceValidationReason =
  | 'NEGATIVE_PRICE'
  | 'NON_FINITE_PRICE'
  | 'NULL_PRICE'
  | 'STRING_PRICE'
  | 'MISSING_PRICE'
  | 'INVALID_PRICE_TYPE';

export interface ConnectProductValidationIssue {
  index: number | null;
  field: ConnectProductField;
  expectedType: string;
  receivedType: string;
  errorCode: string;
  /** Safe categorical cause only; never contains the raw value. */
  reason?: ConnectPriceValidationReason;
}

export interface ConnectProductValidationDiagnostic {
  productsCount: number | null;
  validProductsCount: number;
  invalidProductsCount: number;
  issuesTruncated: boolean;
  issues: ConnectProductValidationIssue[];
}

/** Read-only Connect capabilities allowed during configuration testing. */
export interface ConnectProviderPort {
  getProducts(
    httpBaseUrl: string,
    accessKey: string,
    accessSecret: string,
  ): Promise<ProductsCheckResult>;
}
