import {
  ConnectClientError,
  ConnectHttpClient,
  classifyTransportError,
  validateProductList,
} from './infrastructure/connect-http.client';

class MockConnectHttpClient extends ConnectHttpClient {
  response: { statusCode: number; text: string } = { statusCode: 200, text: '{"data":[]}' };
  addresses = [{ address: '8.8.8.8', family: 4 as const }];
  authorization = '';
  override async resolveAddresses() {
    return this.addresses;
  }
  override async requestRaw(_url: URL, authorization: string) {
    this.authorization = authorization;
    return this.response;
  }
}

describe('ConnectHttpClient security', () => {
  it.each([
    ['certificate validation', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'TLS_ERROR'],
    ['TLS handshake', 'ERR_TLS_HANDSHAKE_TIMEOUT', 'TLS_ERROR'],
    ['socket timeout', 'ETIMEDOUT', 'CONNECTION_TIMEOUT'],
    ['DNS resolver failure', 'ENOTFOUND', 'CONNECTION_FAILED'],
  ])('classifies %s transport errors without exposing details', (_name, sourceCode, code) => {
    expect(
      classifyTransportError(
        Object.assign(new Error('private transport detail'), { code: sourceCode }),
      ),
    ).toBe(code);
  });

  it('rejects hosts outside the official allowlist before making a request', async () => {
    const client = new ConnectHttpClient();
    await expect(client.getProducts('https://127.0.0.1', 'key', 'secret')).rejects.toMatchObject<
      Partial<ConnectClientError>
    >({ code: 'ENDPOINT_NOT_ALLOWED' });
  });

  it.each([
    [401, 'HTTP_401'],
    [403, 'HTTP_403'],
    [429, 'HTTP_429'],
    [500, 'HTTP_5XX'],
  ])('maps HTTP %s to a safe error code', async (status, code) => {
    const client = new MockConnectHttpClient();
    client.response = { statusCode: status, text: 'untrusted response details' };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({ code, httpConnected: true });
  });

  it('accepts a products response without persisting or returning product data', async () => {
    const client = new MockConnectHttpClient();
    client.response = {
      statusCode: 200,
      text: JSON.stringify({ data: [validProduct()] }),
    };
    const result = await client.getProducts(
      'https://connect.tala-app.ir',
      'test-key',
      'test-secret',
    );
    expect(result).toMatchObject({
      connectionStatus: 'CONNECTED_VALID',
      httpConnected: true,
      dataValidationStatus: 'VALID',
      productsCount: 1,
      validProductsCount: 1,
      invalidProductsCount: 0,
      pricingReady: false,
    });
    expect(JSON.stringify(result)).not.toContain('product-uuid');
    expect(JSON.stringify(result)).not.toContain('سکه تمام');
    expect(JSON.stringify(result)).not.toContain('50000000');
    expect(client.authorization).toBe(
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    );
  });

  it('provides catalog payload only to the server-side sync method after validating the envelope', async () => {
    const client = new MockConnectHttpClient();
    const product = validProduct();
    client.response = { statusCode: 200, text: JSON.stringify({ data: [product] }) };
    await expect(
      client.fetchProductsForSync('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).resolves.toEqual([product]);
    expect(client.authorization).toBe(
      `Basic ${Buffer.from('test-key:test-secret').toString('base64')}`,
    );
    client.response = { statusCode: 200, text: JSON.stringify({ products: [product] }) };
    await expect(
      client.fetchProductsForSync('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE', httpConnected: true });
  });

  it('accepts an empty products list as a valid read-only response', async () => {
    const client = new MockConnectHttpClient();
    client.response = { statusCode: 200, text: '{"data":[]}' };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).resolves.toMatchObject({
      connectionStatus: 'CONNECTED_VALID',
      dataValidationStatus: 'VALID',
      productsCount: 0,
      validProductsCount: 0,
      invalidProductsCount: 0,
      pricingReady: false,
    });
  });

  it('rejects invalid and unexpected response bodies', async () => {
    const client = new MockConnectHttpClient();
    client.response = { statusCode: 200, text: '{' };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({ code: 'INVALID_JSON' });
    client.response = { statusCode: 200, text: '{"products":[]}' };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      diagnostic: {
        productsCount: null,
        validProductsCount: 0,
        invalidProductsCount: 0,
        issues: [{ index: null, field: 'data', receivedType: 'missing' }],
      },
    });

  });

  it('treats an inactive product with valid fields as data-valid', () => {
    const result = validateProductList([{ ...validProduct(), is_active: false }]);
    expect(result).toMatchObject({
      valid: true,
      diagnostic: { productsCount: 1, validProductsCount: 1, invalidProductsCount: 0 },
    });
  });

  it.each([
    ['empty id', { ...validProduct(), id: ' ' }, 'INVALID_PRODUCT_ID', 'id', 'string'],
    ['empty title', { ...validProduct(), title: '' }, 'INVALID_PRODUCT_TITLE', 'title', 'string'],
    [
      'string price',
      { ...validProduct(), buy_price: '50000000' },
      'INVALID_BUY_PRICE',
      'buy_price',
      'string',
    ],
    [
      'null price',
      { ...validProduct(), buy_price: null },
      'INVALID_BUY_PRICE',
      'buy_price',
      'null',
    ],
    [
      'negative sell price',
      { ...validProduct(), sell_price: -1 },
      'INVALID_SELL_PRICE',
      'sell_price',
      'number',
    ],
    [
      'negative price',
      { ...validProduct(), buy_price: -1 },
      'INVALID_BUY_PRICE',
      'buy_price',
      'number',
    ],
    [
      'null status',
      { ...validProduct(), is_active: null },
      'INVALID_PRODUCT_STATUS',
      'is_active',
      'null',
    ],
    [
      'missing status',
      omit(validProduct(), 'is_buy_active'),
      'INVALID_PRODUCT_STATUS',
      'is_buy_active',
      'missing',
    ],
    [
      'invalid sell status',
      { ...validProduct(), is_sell_active: 'true' },
      'INVALID_PRODUCT_STATUS',
      'is_sell_active',
      'string',
    ],
    [
      'inactive product with invalid price',
      { ...validProduct(), is_active: false, sell_price: null },
      'INVALID_SELL_PRICE',
      'sell_price',
      'null',
    ],
  ])(
    'reports partial data health for products with %s without returning field values',
    async (_caseName, product, code, field, receivedType) => {
      const client = new MockConnectHttpClient();
      client.response = { statusCode: 200, text: JSON.stringify({ data: [product] }) };
      const result = await client.getProducts(
        'https://connect.tala-app.ir',
        'test-key',
        'test-secret',
      );
      expect(result).toMatchObject({
        success: true,
        connectionStatus: 'CONNECTED_WITH_WARNINGS',
        httpConnected: true,
        dataValidationStatus: 'INVALID',
        validProductsCount: 0,
        invalidProductsCount: 1,
        pricingReady: false,
        diagnostic: {
          productsCount: 1,
          validProductsCount: 0,
          invalidProductsCount: 1,
          issues: [{ index: 0, field, receivedType, errorCode: code }],
        },
      });
      expect(JSON.stringify(result.diagnostic)).not.toContain('product-uuid');
      expect(JSON.stringify(result.diagnostic)).not.toContain('50000000');
      expect(JSON.stringify(result.diagnostic)).not.toContain('49500000');
    },
  );

  it('reports mixed product validity and preserves 0-based indexes in a mock list', async () => {
    const client = new MockConnectHttpClient();
    const products = Array.from({ length: 21 }, () => validProduct());
    // Synthetic negative numbers exercise validation only; these are not observed Connect values.
    products[8] = { ...validProduct(), sell_price: -1 };
    products[9] = { ...validProduct(), sell_price: -2 };
    products[10] = { ...validProduct(), sell_price: -3 };
    client.response = {
      statusCode: 200,
      text: JSON.stringify({ data: products }),
    };
    const result = await client.getProducts(
      'https://connect.tala-app.ir',
      'test-key',
      'test-secret',
    );
    expect(result).toMatchObject({
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      httpConnected: true,
      dataValidationStatus: 'PARTIAL',
      productsCount: 21,
      validProductsCount: 18,
      invalidProductsCount: 3,
      pricingReady: false,
      diagnostic: {
        issues: [
          { index: 8, field: 'sell_price', receivedType: 'number', reason: 'NEGATIVE_PRICE' },
          { index: 9, field: 'sell_price', receivedType: 'number', reason: 'NEGATIVE_PRICE' },
          { index: 10, field: 'sell_price', receivedType: 'number', reason: 'NEGATIVE_PRICE' },
        ],
      },
    });

    const syncPayload = await client.fetchProductsForSync(
      'https://connect.tala-app.ir',
      'test-key',
      'test-secret',
    );
    const syncValidation = validateProductList(syncPayload);
    expect(syncValidation.diagnostic).toMatchObject({
      productsCount: 21,
      validProductsCount: result.validProductsCount,
      invalidProductsCount: result.invalidProductsCount,
    });
  });

  it('marks all-invalid product lists as connected with warnings but not price ready', async () => {
    const client = new MockConnectHttpClient();
    client.response = {
      statusCode: 200,
      text: JSON.stringify({ data: [{ ...validProduct(), sell_price: -1 }] }),
    };
    const result = await client.getProducts('https://connect.tala-app.ir', 'k', 's');
    expect(result).toMatchObject({
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      dataValidationStatus: 'INVALID',
      validProductsCount: 0,
      invalidProductsCount: 1,
      pricingReady: false,
    });
  });

  it('rejects NaN and Infinity in the pure price validator', () => {
    for (const sellPrice of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = validateProductList([{ ...validProduct(), sell_price: sellPrice }]);
      expect(result).toMatchObject({
        valid: false,
        diagnostic: {
          validProductsCount: 0,
          invalidProductsCount: 1,
          issues: [
            {
              field: 'sell_price',
              receivedType: 'number',
              errorCode: 'INVALID_SELL_PRICE',
              reason: 'NON_FINITE_PRICE',
            },
          ],
        },
      });
    }
  });

  it.each([
    ['positive number', 12.5, true, undefined],
    ['zero', 0, true, undefined],
    ['negative number', -0.01, true, 'NEGATIVE_PRICE'],
    ['NaN', Number.NaN, true, 'NON_FINITE_PRICE'],
    ['Infinity', Number.POSITIVE_INFINITY, true, 'NON_FINITE_PRICE'],
    ['null', null, true, 'NULL_PRICE'],
    ['string', '12.5', true, 'STRING_PRICE'],
    ['missing', undefined, false, 'MISSING_PRICE'],
    ['boolean', true, true, 'INVALID_PRICE_TYPE'],
  ])('classifies price case %s without returning the raw value', (_name, value, present, reason) => {
    const item = validProduct() as Record<string, unknown>;
    if (present) item.buy_price = value;
    else delete item.buy_price;
    const result = validateProductList([item]);
    if (reason === undefined) {
      expect(result).toMatchObject({ valid: true, diagnostic: { validProductsCount: 1 } });
      return;
    }
    const issue = result.diagnostic.issues.find((entry) => entry.field === 'buy_price');
    expect(issue).toMatchObject({ reason });
    expect(JSON.stringify(issue)).not.toContain('12.5');
  });

  it('classifies JSON number overflow after parsing without exposing the number', async () => {
    const client = new MockConnectHttpClient();
    const body = JSON.stringify({ data: [validProduct()] }).replace(
      '"sell_price":49500000',
      '"sell_price":1e999',
    );
    client.response = { statusCode: 200, text: body };
    const result = await client.getProducts('https://connect.tala-app.ir', 'key', 'secret');
    expect(result.diagnostic.issues).toEqual([
      expect.objectContaining({
        index: 0,
        field: 'sell_price',
        receivedType: 'number',
        reason: 'NON_FINITE_PRICE',
      }),
    ]);
    expect(JSON.stringify(result.diagnostic)).not.toContain('1e999');
  });

  it('accepts numeric prices and rejects numeric strings without normalization', async () => {
    const client = new MockConnectHttpClient();
    client.response = { statusCode: 200, text: JSON.stringify({ data: [validProduct()] }) };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'k', 's'),
    ).resolves.toMatchObject({ connectionStatus: 'CONNECTED_VALID', productsCount: 1 });
    client.response = {
      statusCode: 200,
      text: JSON.stringify({ data: [{ ...validProduct(), sell_price: '49500000' }] }),
    };
    await expect(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).resolves.toMatchObject({
      connectionStatus: 'CONNECTED_WITH_WARNINGS',
      diagnostic: { issues: [{ field: 'sell_price', receivedType: 'string' }] },
    });
  });

  it('keeps the main response shape failure separate and marks HTTP transport connected', async () => {
    const client = new MockConnectHttpClient();
    client.response = { statusCode: 200, text: '{"data":null}' };
    await expectClientError(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).then((error) =>
      expect(error).toMatchObject({ code: 'INVALID_RESPONSE', httpConnected: true }),
    );
  });

  it('reports timeout as failed HTTP connectivity', async () => {
    const client = new MockConnectHttpClient();
    client.requestRaw = async () => {
      throw new ConnectClientError('CONNECTION_TIMEOUT');
    };
    await expectClientError(
      client.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).then((error) => expect(error).toMatchObject({ code: 'CONNECTION_TIMEOUT', httpConnected: false }));
  });

  it('rejects private DNS answers and safely maps DNS failures', async () => {
    const privateAddressClient = new MockConnectHttpClient();
    privateAddressClient.addresses = [{ address: '127.0.0.1', family: 4 }];
    await expect(
      privateAddressClient.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({ code: 'UNSAFE_DNS_RESULT' });

    const dnsFailureClient = new MockConnectHttpClient();
    dnsFailureClient.resolveAddresses = async () => {
      throw new ConnectClientError('DNS_FAILURE');
    };
    await expect(
      dnsFailureClient.getProducts('https://connect.tala-app.ir', 'test-key', 'test-secret'),
    ).rejects.toMatchObject({ code: 'DNS_FAILURE' });
  });
});

function validProduct() {
  return {
    id: 'product-uuid',
    title: 'سکه تمام',
    buy_price: 50000000,
    sell_price: 49500000,
    is_active: true,
    is_buy_active: true,
    is_sell_active: true,
  };
}

async function expectClientError(promise: Promise<unknown>): Promise<ConnectClientError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ConnectClientError) return error;
    throw error;
  }
  throw new Error('Expected ConnectClientError');
}

function omit<T extends Record<string, unknown>, K extends keyof T>(value: T, key: K) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}
