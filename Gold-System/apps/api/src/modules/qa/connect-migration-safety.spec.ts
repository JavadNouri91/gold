import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Connect migration safety', () => {
  it('creates only the Connect settings table and does not alter operational data', () => {
    const migrationPath = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'prisma',
      'migrations',
      '202611100001_connect_integration_settings',
      'migration.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8');
    const createdTables = [...sql.matchAll(/CREATE\s+TABLE\s+"([^"]+)"/gi)].map(
      (match) => match[1],
    );

    expect(createdTables).toEqual(['connect_integration_settings']);
    expect(sql).not.toMatch(/\b(DROP|ALTER|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(sql).not.toMatch(
      /"(orders?|trades?|purchases?|customers?|financial_[^"]*|gold_[^"]*)"/i,
    );
  });
});
