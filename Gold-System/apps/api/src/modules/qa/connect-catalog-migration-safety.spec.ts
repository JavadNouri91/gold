import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Connect catalog migration safety', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      '202611100002_connect_product_catalog_mapping',
      'migration.sql',
    ),
    'utf8',
  );

  it('only alters Connect settings and creates Connect catalog/mapping tables', () => {
    expect(migration).toContain('ALTER TABLE "connect_integration_settings"');
    for (const table of ['connect_product_syncs', 'connect_products', 'connect_product_mappings']) {
      expect(migration).toContain(`CREATE TABLE "${table}"`);
    }
    expect(migration).not.toMatch(
      /\b(DROP\s+(TABLE|TYPE|INDEX)|TRUNCATE|DELETE\s+FROM|UPDATE\s+"[^\"]+")\b/i,
    );
    for (const unrelated of [
      'financial_ledger',
      'gold_ledger',
      'orders',
      'trades',
      'purchases',
      'customers',
      'price_snapshots',
    ]) {
      expect(migration).not.toContain(`ALTER TABLE "${unrelated}"`);
      expect(migration).not.toContain(`CREATE TABLE "${unrelated}"`);
    }
  });
});
