import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      files.push(...walk(full));
    } else if (entry.endsWith('.controller.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('permission matrix', () => {
  const apiSrc = join(__dirname, '..', '..');
  const seedPath = join(apiSrc, '..', '..', '..', 'prisma', 'seed.ts');
  const seed = readFileSync(seedPath, 'utf8');

  function roleBlock(roleName: string): string {
    const marker = `name: '${roleName}'`;
    const start = seed.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const next = seed.indexOf("name: '", start + marker.length);
    return seed.slice(start, next === -1 ? undefined : next);
  }

  it('seeds every permission required by a controller', () => {
    const required = new Set<string>();
    for (const file of walk(apiSrc)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/@RequirePermissions\('([^']+)'\)/g)) {
        required.add(match[1]);
      }
      for (const match of source.matchAll(/permissions\.includes\('([^']+)'\)/g)) {
        required.add(match[1]);
      }
    }

    const missing = [...required].filter((key) => !seed.includes(`key: '${key}'`));
    expect(missing).toEqual([]);
  });

  it('keeps customer permissions inside the self-service set', () => {
    const customer = roleBlock('customer');
    expect(customer).toContain('customer.order.create');
    expect(customer).not.toContain('customer.read');
    expect(customer).not.toContain('kyc.documents.read');
    expect(customer).not.toContain('trade.approve');
    expect(customer).not.toContain('payment.create');
  });

  it('grants KYC document access to reviewer and accountant, and decisions to reviewer', () => {
    const reviewer = roleBlock('reviewer');
    const accountant = roleBlock('accountant');
    expect(reviewer).toContain('kyc.review');
    expect(reviewer).toContain('kyc.documents.read');
    expect(accountant).toContain('kyc.documents.read');
    expect(accountant).not.toContain('kyc.review');
  });

  it('lets accountant complete the documented payment workflow', () => {
    const accountant = roleBlock('accountant');
    for (const key of [
      'payment.create',
      'payment.validate',
      'payment.allocate',
      'payment.read',
      'settlement.read',
    ]) {
      expect(accountant).toContain(`'${key}'`);
    }
  });

  it('does not grant trade approval to the customer or operator roles', () => {
    expect(roleBlock('customer')).not.toContain('trade.approve');
    expect(roleBlock('operator')).not.toContain('trade.approve');
    expect(roleBlock('seller')).toContain('trade.approve');
  });
});
