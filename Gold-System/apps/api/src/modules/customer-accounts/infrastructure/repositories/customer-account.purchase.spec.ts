import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { CustomerAccountRepository } from './customer-account.repository';

describe('purchase wallet accounting', () => {
  function wallet() {
    const row = {
      id: 'account',
      credit_limit_rial: new Decimal(1000),
      reserved_credit_rial: new Decimal(0),
      consumed_credit_rial: new Decimal(0),
    };
    const create = jest.fn();
    const execute = jest.fn(async (sql: TemplateStringsArray, amount: Decimal) => {
      const text = sql.join('');
      if (text.includes('reserved_credit_rial = reserved_credit_rial +')) {
        row.reserved_credit_rial = row.reserved_credit_rial.plus(amount);
      } else {
        row.reserved_credit_rial = row.reserved_credit_rial.minus(amount);
      }
      if (text.includes('consumed_credit_rial = consumed_credit_rial +')) {
        row.consumed_credit_rial = row.consumed_credit_rial.plus(amount);
      }
      return 1;
    });
    const tx = {
      $queryRaw: jest.fn(async () => [row]),
      $executeRaw: execute,
      creditTransaction: { create },
    } as unknown as Prisma.TransactionClient;
    const repo = new CustomerAccountRepository(null!);
    const params = {
      tx,
      customerId: 'customer',
      amount: new Decimal(180),
      orderId: 'order',
      actorId: 'actor',
    };
    const available = () =>
      row.credit_limit_rial
        .minus(row.reserved_credit_rial)
        .minus(row.consumed_credit_rial)
        .toFixed(2);
    return { repo, params, create, execute, available };
  }

  it('deducts immediately and preserves available balance when approval consumes the reservation', async () => {
    const w = wallet();
    await w.repo.reserveCredit(w.params);
    expect(w.available()).toBe('820.00');
    await w.repo.consumeCredit({ ...w.params, tradeId: 'trade' });
    expect(w.available()).toBe('820.00');
    expect(w.create.mock.calls.map(([input]) => input.data.type)).toEqual([
      'RESERVATION',
      'CONSUME',
    ]);
    expect(w.create.mock.calls[1][0].data.balanceAfter.toFixed(2)).toBe('820.00');
    await expect(w.repo.consumeCredit({ ...w.params, tradeId: 'trade' })).rejects.toThrow(
      'only 0.00 Rial is reserved',
    );
    expect(w.create).toHaveBeenCalledTimes(2);
  });

  it('refunds exactly the original reservation and blocks a duplicate refund', async () => {
    const w = wallet();
    await w.repo.reserveCredit(w.params);
    await w.repo.releaseCredit({ ...w.params, reason: 'ORDER_REJECTED' });
    expect(w.available()).toBe('1000.00');
    expect(w.create.mock.calls.map(([input]) => input.data.type)).toEqual([
      'RESERVATION',
      'RELEASE',
    ]);
    await expect(w.repo.releaseCredit({ ...w.params, reason: 'ORDER_REJECTED' })).rejects.toThrow(
      'Possible double-release',
    );
    expect(w.available()).toBe('1000.00');
    expect(w.execute).toHaveBeenCalledTimes(2);
    expect(w.create).toHaveBeenCalledTimes(2);
  });
});
