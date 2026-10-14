import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeMode,
  TradeSide,
} from '@gold/shared-types';
import { TransactionFeeService } from './transaction-fee.service';
import { FeePolicyEntity } from '../domain/entities/fee-policy.entity';

describe('TransactionFeeService', () => {
  const bases = {
    step4AfterWeight: new Decimal('1000000'),
    step5AfterGroupRule: new Decimal('1020000'),
    goldCommercialRial: new Decimal('1050000'),
  };

  function policy(overrides: Partial<ConstructorParameters<typeof FeePolicyEntity>[0]> = {}) {
    return new FeePolicyEntity({
      id: 'fee-1',
      customerType: CustomerType.HOUSEHOLD,
      side: TradeSide.BUY,
      code: FeeChargeCode.TRANSACTION_FEE,
      labelFa: 'کارمزد خرید',
      mode: FeeMode.PERCENTAGE,
      value: new Decimal('2'),
      calculationBase: FeeCalculationBase.GOLD_COMMERCIAL_TOTAL,
      enabled: true,
      priority: 10,
      activeFrom: new Date('2020-01-01'),
      activeTo: null,
      status: 'ACTIVE',
      ...overrides,
    });
  }

  function service(active: FeePolicyEntity | null) {
    const feeRepo = {
      findActiveForType: jest.fn().mockResolvedValue(active),
    };
    const prisma = { transactionChargeSnapshot: { findMany: jest.fn(), createMany: jest.fn() } };
    return new TransactionFeeService(feeRepo as never, prisma as never);
  }

  it('returns zero fees when no policy', async () => {
    const result = await service(null).compute(CustomerType.HOUSEHOLD, TradeSide.BUY, bases);
    expect(result.feeTotalRial.toFixed(2)).toBe('0.00');
    expect(result.payableRial?.toFixed(2)).toBe('1050000.00');
    expect(result.charges).toHaveLength(0);
  });

  it('adds BUY percentage fee of gold commercial', async () => {
    const result = await service(policy()).compute(CustomerType.HOUSEHOLD, TradeSide.BUY, bases);
    expect(result.feeTotalRial.toFixed(2)).toBe('21000.00');
    expect(result.payableRial?.toFixed(2)).toBe('1071000.00');
    expect(result.charges[0]?.baseAmount.toFixed(2)).toBe('1050000.00');
  });

  it('deducts SELL fee from proceeds', async () => {
    const result = await service(
      policy({ side: TradeSide.SELL, labelFa: 'کارمزد فروش' }),
    ).compute(CustomerType.VIP, TradeSide.SELL, bases);
    expect(result.feeTotalRial.toFixed(2)).toBe('21000.00');
    expect(result.receivableRial?.toFixed(2)).toBe('1029000.00');
  });

  it('uses FIXED fee without base', async () => {
    const result = await service(
      policy({
        mode: FeeMode.FIXED,
        value: new Decimal('50000'),
        calculationBase: null,
      }),
    ).compute(CustomerType.PARTNER, TradeSide.BUY, bases);
    expect(result.feeTotalRial.toFixed(2)).toBe('50000.00');
    expect(result.payableRial?.toFixed(2)).toBe('1100000.00');
  });

  it('rejects SELL when fee exceeds gold commercial', async () => {
    await expect(
      service(
        policy({
          side: TradeSide.SELL,
          mode: FeeMode.FIXED,
          value: new Decimal('2000000'),
          calculationBase: null,
        }),
      ).compute(CustomerType.HOUSEHOLD, TradeSide.SELL, bases),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses step4 base when configured', async () => {
    const result = await service(
      policy({
        calculationBase: FeeCalculationBase.GOLD_VALUE_STEP4,
        value: new Decimal('1'),
      }),
    ).compute(CustomerType.HOUSEHOLD, TradeSide.BUY, bases);
    expect(result.feeTotalRial.toFixed(2)).toBe('10000.00');
  });
});
