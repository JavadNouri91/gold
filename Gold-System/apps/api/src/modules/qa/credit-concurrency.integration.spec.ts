import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import { CustomerAccountRepository } from '../customer-accounts/infrastructure/repositories/customer-account.repository';
import { PrismaService } from '../../database/prisma.service';
import { InsufficientCreditException } from '../orders/domain/exceptions/order.exceptions';

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = resolve(__dirname, '../../../../.env');
  const text = readFileSync(envPath, 'utf8');
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='));
  if (!line) return undefined;
  let value = line.slice('DATABASE_URL='.length).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  process.env.DATABASE_URL = value;
  return value;
}

describe('database credit concurrency', () => {
  const databaseUrl = loadDatabaseUrl();
  const prisma = databaseUrl ? new PrismaClient() : null;
  const repo = prisma ? new CustomerAccountRepository(prisma as unknown as PrismaService) : null;

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('has no real or double precision columns', async () => {
    if (!prisma) throw new Error('DATABASE_URL is not set');
    const floats = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND data_type IN ('real', 'double precision')
    `;
    expect(floats).toEqual([]);
  });

  it('has no unbalanced financial journals', async () => {
    if (!prisma) throw new Error('DATABASE_URL is not set');
    const unbalanced = await prisma.$queryRaw<Array<{ journal_id: string }>>`
      SELECT journal_id
      FROM financial_ledger_entries
      GROUP BY journal_id
      HAVING SUM(debit) <> SUM(credit)
    `;
    expect(unbalanced).toEqual([]);
  });

  it('blocks a second concurrent reservation that would exceed available credit', async () => {
    if (!prisma || !repo) throw new Error('DATABASE_URL is not set');
    const stamp = Date.now().toString();
    const mobile = `09${stamp.slice(-9)}`;
    const user = await prisma.user.create({
      data: { name: 'QA Credit', mobile },
    });
    const customer = await prisma.customer.create({
      data: {
        customerNumber: `QA-${stamp}`,
        userId: user.id,
        firstName: 'QA',
        lastName: 'Credit',
        nationalId: `8${stamp.slice(-9)}`,
        mobile,
        status: 'ACTIVE',
      },
    });
    const account = await prisma.customerAccount.create({
      data: {
        customerId: customer.id,
        status: 'ACTIVE',
        creditLimitRial: new Decimal('100.00'),
      },
    });

    try {
      const attempts = await Promise.allSettled([
        prisma.$transaction((tx) =>
          repo.reserveCredit({
            tx,
            customerId: customer.id,
            amount: new Decimal('60.00'),
            orderId: `qa-order-a-${stamp}`,
            actorId: user.id,
          }),
        ),
        prisma.$transaction((tx) =>
          repo.reserveCredit({
            tx,
            customerId: customer.id,
            amount: new Decimal('60.00'),
            orderId: `qa-order-b-${stamp}`,
            actorId: user.id,
          }),
        ),
      ]);

      const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
      const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        InsufficientCreditException,
      );

      const stored = await prisma.customerAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(new Decimal(stored.reservedCreditRial.toString()).toFixed(2)).toBe('60.00');
      expect(new Decimal(stored.consumedCreditRial.toString()).toFixed(2)).toBe('0.00');
    } finally {
      await prisma.creditTransaction.deleteMany({ where: { accountId: account.id } });
      await prisma.customerAccount.delete({ where: { id: account.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30000);

  it('rolls back a reservation when the surrounding transaction aborts', async () => {
    if (!prisma || !repo) throw new Error('DATABASE_URL is not set');
    const stamp = `${Date.now()}r`;
    const mobile = `08${stamp.slice(-9)}`;
    const user = await prisma.user.create({
      data: { name: 'QA Rollback', mobile },
    });
    const customer = await prisma.customer.create({
      data: {
        customerNumber: `QA-RB-${stamp}`,
        userId: user.id,
        firstName: 'QA',
        lastName: 'Rollback',
        nationalId: `7${stamp.slice(-9)}`,
        mobile,
        status: 'ACTIVE',
      },
    });
    const account = await prisma.customerAccount.create({
      data: {
        customerId: customer.id,
        status: 'ACTIVE',
        creditLimitRial: new Decimal('100.00'),
      },
    });

    try {
      await expect(
        prisma.$transaction(async (tx) => {
          await repo.reserveCredit({
            tx,
            customerId: customer.id,
            amount: new Decimal('40.00'),
            orderId: `qa-order-rb-${stamp}`,
            actorId: user.id,
          });
          throw new Error('forced rollback');
        }),
      ).rejects.toThrow('forced rollback');

      const stored = await prisma.customerAccount.findUniqueOrThrow({
        where: { id: account.id },
      });
      expect(new Decimal(stored.reservedCreditRial.toString()).toFixed(2)).toBe('0.00');
      const txCount = await prisma.creditTransaction.count({ where: { accountId: account.id } });
      expect(txCount).toBe(0);
    } finally {
      await prisma.creditTransaction.deleteMany({ where: { accountId: account.id } });
      await prisma.customerAccount.delete({ where: { id: account.id } });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  }, 30000);
});
