import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { isIP } from 'node:net';
import type {
  ConnectProductField,
  ConnectProductValidationDiagnostic,
  ConnectProductValidationIssue,
  ConnectPriceValidationReason,
  ConnectProviderPort,
  ProductsCheckResult,
} from '../domain/interfaces/connect-provider.port';

export class ConnectClientError extends Error {
  constructor(
    readonly code: string,
    readonly diagnostic?: ConnectProductValidationDiagnostic,
    readonly httpConnected = false,
  ) {
    super(code);
  }
}

const MAX_BODY_BYTES = 512 * 1024;
const MAX_DIAGNOSTIC_ISSUES = 100;
const CONNECT_HOST_ALLOWLIST = new Set(['connect.tala-app.ir']);
interface ResolvedAddress {
  address: string;
  family: number;
}

@Injectable()
export class ConnectHttpClient implements ConnectProviderPort {
  async getProducts(
    httpBaseUrl: string,
    accessKey: string,
    accessSecret: string,
  ): Promise<ProductsCheckResult> {
    const startedAt = Date.now();
    const payload = await this.requestProductsPayload(httpBaseUrl, accessKey, accessSecret);
    const validation = validateProductsResponse(payload);
    if (!validation.valid && validation.diagnostic.productsCount === null) {
      throw new ConnectClientError(
        'INVALID_RESPONSE',
        validation.diagnostic,
        true,
      );
    }
    const { productsCount, validProductsCount, invalidProductsCount } = validation.diagnostic;
    const hasWarnings = invalidProductsCount > 0;
    return {
      success: true,
      connectionStatus: hasWarnings ? 'CONNECTED_WITH_WARNINGS' : 'CONNECTED_VALID',
      httpConnected: true,
      dataValidationStatus:
        invalidProductsCount === 0 ? 'VALID' : validProductsCount === 0 ? 'INVALID' : 'PARTIAL',
      productsCount: productsCount ?? 0,
      validProductsCount,
      invalidProductsCount,
      pricingReady: false,
      diagnostic: validation.diagnostic,
      responseTimeMs: Date.now() - startedAt,
    };
  }

  /** Returns the parsed provider payload only to the server-side catalog sync service. */
  async fetchProductsForSync(
    httpBaseUrl: string,
    accessKey: string,
    accessSecret: string,
  ): Promise<unknown[]> {
    const payload = await this.requestProductsPayload(httpBaseUrl, accessKey, accessSecret);
    const validation = validateProductsResponse(payload);
    if (!validation.valid && validation.diagnostic.productsCount === null) {
      throw new ConnectClientError(
        'INVALID_RESPONSE',
        validation.diagnostic,
        true,
      );
    }
    // Invalid rows are kept in memory for safe per-row diagnostics; callers must
    // validate each field before persisting and must never log this value.
    return (payload as { data: unknown[] }).data;
  }

  private async requestProductsPayload(
    httpBaseUrl: string,
    accessKey: string,
    accessSecret: string,
  ): Promise<unknown> {
    const url = new URL('/api/products', httpBaseUrl);
    if (url.protocol !== 'https:' || !CONNECT_HOST_ALLOWLIST.has(url.hostname.toLowerCase()))
      throw new ConnectClientError('ENDPOINT_NOT_ALLOWED');
    const addresses = await this.resolveAddresses(url.hostname);
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address)))
      throw new ConnectClientError('UNSAFE_DNS_RESULT');
    const authorization = `Basic ${Buffer.from(`${accessKey}:${accessSecret}`, 'utf8').toString('base64')}`;
    const body = await this.requestRaw(url, authorization, addresses);
    if (body.statusCode === 401) throw new ConnectClientError('HTTP_401', undefined, true);
    if (body.statusCode === 403) throw new ConnectClientError('HTTP_403', undefined, true);
    if (body.statusCode === 429) throw new ConnectClientError('HTTP_429', undefined, true);
    if (body.statusCode < 200 || body.statusCode >= 300)
      throw new ConnectClientError(
        body.statusCode >= 500 ? 'HTTP_5XX' : 'HTTP_ERROR',
        undefined,
        true,
      );
    try {
      return JSON.parse(body.text);
    } catch {
      throw new ConnectClientError('INVALID_JSON', undefined, true);
    }
  }

  protected async resolveAddresses(hostname: string): Promise<ResolvedAddress[]> {
    try {
      return await lookup(hostname, { all: true, verbatim: true });
    } catch {
      throw new ConnectClientError('DNS_FAILURE');
    }
  }

  protected requestRaw(url: URL, authorization: string, addresses: ResolvedAddress[]) {
    return new Promise<{ statusCode: number; text: string }>((resolve, reject) => {
      const req = httpsRequest(
        url,
        {
          method: 'GET',
          headers: { Authorization: authorization, Accept: 'application/json' },
          timeout: 5000,
          maxHeaderSize: 8192,
          // Pin the validated DNS answer to avoid a second lookup / rebinding window.
          lookup: (_hostname, options, callback) => {
            const selected = addresses[0];
            if (typeof options === 'object' && options?.all) {
              callback(
                null,
                addresses.map((item) => ({ address: item.address, family: item.family })),
              );
            } else {
              callback(null, selected.address, selected.family);
            }
          },
        },
        (response) => {
          if ((response.statusCode ?? 0) >= 300 && (response.statusCode ?? 0) < 400) {
            response.resume();
            reject(new ConnectClientError('REDIRECT_REJECTED', undefined, true));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              req.destroy(new ConnectClientError('RESPONSE_TOO_LARGE', undefined, true));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () =>
            resolve({
              statusCode: response.statusCode ?? 0,
              text: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );
      req.on('timeout', () => req.destroy(new ConnectClientError('CONNECTION_TIMEOUT')));
      req.on('error', (error: Error) =>
        reject(
          error instanceof ConnectClientError
            ? error
            : new ConnectClientError(classifyTransportError(error)),
        ),
      );
      req.end();
    });
  }
}

export function classifyTransportError(error: Error): string {
  const code = 'code' in error ? String((error as Error & { code?: unknown }).code ?? '') : '';
  if (
    code.startsWith('ERR_TLS_') ||
    code.startsWith('ERR_SSL_') ||
    code.startsWith('CERT_') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  )
    return 'TLS_ERROR';
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return 'CONNECTION_TIMEOUT';
  return 'CONNECTION_FAILED';
}

const PRODUCT_FIELDS: Array<{
  field: Exclude<ConnectProductField, 'data' | '$product'>;
  expectedType: string;
  errorCode: string;
  valid: (value: unknown) => boolean;
  diagnose?: (value: unknown, present: boolean) => ConnectPriceValidationReason | undefined;
}> = [
  {
    field: 'id',
    expectedType: 'non-empty string (max 200 characters)',
    errorCode: 'INVALID_PRODUCT_ID',
    valid: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 200,
  },
  {
    field: 'title',
    expectedType: 'non-empty string (max 300 characters)',
    errorCode: 'INVALID_PRODUCT_TITLE',
    valid: (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 300,
  },
  {
    field: 'buy_price',
    expectedType: 'finite non-negative number',
    errorCode: 'INVALID_BUY_PRICE',
    valid: (value) => classifyPrice(value, true) === undefined,
    diagnose: classifyPrice,
  },
  {
    field: 'sell_price',
    expectedType: 'finite non-negative number',
    errorCode: 'INVALID_SELL_PRICE',
    valid: (value) => classifyPrice(value, true) === undefined,
    diagnose: classifyPrice,
  },
  {
    field: 'is_active',
    expectedType: 'boolean',
    errorCode: 'INVALID_PRODUCT_STATUS',
    valid: (value) => typeof value === 'boolean',
  },
  {
    field: 'is_buy_active',
    expectedType: 'boolean',
    errorCode: 'INVALID_PRODUCT_STATUS',
    valid: (value) => typeof value === 'boolean',
  },
  {
    field: 'is_sell_active',
    expectedType: 'boolean',
    errorCode: 'INVALID_PRODUCT_STATUS',
    valid: (value) => typeof value === 'boolean',
  },
];

function validateProductsResponse(
  payload: unknown,
):
  | { valid: true; products: unknown[]; diagnostic: ConnectProductValidationDiagnostic }
  | { valid: false; diagnostic: ConnectProductValidationDiagnostic } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      diagnostic: {
        productsCount: null,
        validProductsCount: 0,
        invalidProductsCount: 0,
        issuesTruncated: false,
        issues: [
          {
            index: null,
            field: 'data',
            expectedType: 'object containing a data array',
            receivedType: receivedType(payload),
            errorCode: 'INVALID_PRODUCTS_RESPONSE',
          },
        ],
      },
    };
  }
  const response = payload as Record<string, unknown>;
  const dataMissing = !('data' in response);
  const data: unknown = response.data;
  if (!Array.isArray(data)) {
    return {
      valid: false,
      diagnostic: {
        productsCount: null,
        validProductsCount: 0,
        invalidProductsCount: 0,
        issuesTruncated: false,
        issues: [
          {
            index: null,
            field: 'data',
            expectedType: 'array',
            receivedType: receivedType(data, dataMissing ? 'missing' : undefined),
            errorCode: 'INVALID_PRODUCTS_RESPONSE',
          },
        ],
      },
    };
  }

  return validateProductList(data);
}

export function validateProductList(
  data: unknown[],
):
  | { valid: true; products: unknown[]; diagnostic: ConnectProductValidationDiagnostic }
  | { valid: false; diagnostic: ConnectProductValidationDiagnostic } {
  const issues: ConnectProductValidationIssue[] = [];
  let invalidProductsCount = 0;
  let issuesTruncated = false;
  const addIssue = (issue: ConnectProductValidationIssue) => {
    if (issues.length < MAX_DIAGNOSTIC_ISSUES) issues.push(issue);
    else issuesTruncated = true;
  };
  data.forEach((value, index) => {
    const row = validateProductRow(value, index);
    if (!row.valid) invalidProductsCount += 1;
    row.issues.forEach(addIssue);
  });

  const diagnostic: ConnectProductValidationDiagnostic = {
    productsCount: data.length,
    validProductsCount: data.length - invalidProductsCount,
    invalidProductsCount,
    issuesTruncated,
    issues,
  };
  return invalidProductsCount === 0
    ? { valid: true, products: data, diagnostic }
    : { valid: false, diagnostic };
}

/** Canonical per-row validator shared by HTTP health checks and catalog persistence. */
export function validateProductRow(
  value: unknown,
  index: number,
): { valid: boolean; issues: ConnectProductValidationIssue[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      issues: [
        {
          index,
          field: '$product',
          expectedType: 'object',
          receivedType: receivedType(value),
          errorCode: 'INVALID_PRODUCTS_RESPONSE',
        },
      ],
    };
  }

  const product = value as Record<string, unknown>;
  const issues: ConnectProductValidationIssue[] = [];
  PRODUCT_FIELDS.forEach(({ field, expectedType, errorCode, valid, diagnose }) => {
    if (!valid(product[field])) {
      const reason = diagnose?.(product[field], field in product);
      issues.push({
        index,
        field,
        expectedType,
        receivedType: receivedType(product[field], field in product ? undefined : 'missing'),
        errorCode,
        ...(reason ? { reason } : {}),
      });
    }
  });
  return { valid: issues.length === 0, issues };
}

function classifyPrice(
  value: unknown,
  present: boolean,
): ConnectPriceValidationReason | undefined {
  if (!present) return 'MISSING_PRICE';
  if (value === null) return 'NULL_PRICE';
  if (typeof value === 'string') return 'STRING_PRICE';
  if (typeof value !== 'number') return 'INVALID_PRICE_TYPE';
  if (!Number.isFinite(value)) return 'NON_FINITE_PRICE';
  if (value < 0) return 'NEGATIVE_PRICE';
  return undefined;
}

function receivedType(value: unknown, missingHint?: 'missing'): string {
  if (missingHint === 'missing') return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 2 || b === 168)) ||
      (a === 192 && b === 88 && address.split('.')[2] === '99') ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && address.split('.')[2] === '113')
    );
  }
  const ip = address.toLowerCase();
  if (isIP(ip) !== 6) return false;
  const firstHextet = Number.parseInt(ip.split(':')[0] || '0', 16);
  return firstHextet >= 0x2000 && firstHextet <= 0x3fff && !ip.startsWith('2001:db8:');
}
