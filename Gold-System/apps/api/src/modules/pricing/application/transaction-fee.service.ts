import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeChargeSide,
  FeeMode,
  TradeSide,
} from '@gold/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FeePolicyRepository } from '../infrastructure/repositories/fee-policy.repository';
import { FeePolicyEntity } from '../domain/entities/fee-policy.entity';

export interface PricingBases {
  step4AfterWeight: Decimal;
  step5AfterGroupRule: Decimal;
  goldCommercialRial: Decimal;
}

export interface ChargeLine {
  code: FeeChargeCode;
  labelFa: string;
  side: TradeSide;
  mode: FeeMode;
  rateValue: Decimal;
  calculationBase: FeeCalculationBase | null;
  baseAmount: Decimal;
  amount: Decimal;
  policyId: string | null;
}

export interface FeeBreakdown {
  side: TradeSide;
  goldCommercialRial: Decimal;
  charges: ChargeLine[];
  feeTotalRial: Decimal;
  /** BUY: payable; SELL: receivable */
  customerTotalRial: Decimal;
  payableRial: Decimal | null;
  receivableRial: Decimal | null;
}

@Injectable()
export class TransactionFeeService {
  constructor(
    private readonly feeRepo: FeePolicyRepository,
    private readonly prisma: PrismaService,
  ) {}

  async compute(
    customerType: CustomerType | null | undefined,
    side: TradeSide,
    bases: PricingBases,
  ): Promise<FeeBreakdown> {
    // BUY/SELL only — the PICKUP conversion fee is a separate charge (see PickupFeeService).
    const policy = await this.feeRepo.findActiveForType(
      customerType ?? null,
      side as unknown as FeeChargeSide,
      FeeChargeCode.TRANSACTION_FEE,
    );
    const charges: ChargeLine[] = [];

    if (policy && policy.mode !== FeeMode.NONE && policy.enabled) {
      charges.push(this.computeLine(policy, side, bases));
    }

    const feeTotalRial = charges.reduce(
      (sum, c) => sum.plus(c.amount),
      new Decimal(0),
    );

    if (feeTotalRial.lt(0)) {
      throw new BadRequestException('Transaction fee total cannot be negative');
    }

    let customerTotalRial: Decimal;
    let payableRial: Decimal | null = null;
    let receivableRial: Decimal | null = null;

    if (side === TradeSide.BUY) {
      customerTotalRial = bases.goldCommercialRial.plus(feeTotalRial);
      payableRial = customerTotalRial;
      if (customerTotalRial.lt(0)) {
        throw new BadRequestException('BUY payable amount cannot be negative');
      }
    } else {
      customerTotalRial = bases.goldCommercialRial.minus(feeTotalRial);
      receivableRial = customerTotalRial;
      if (customerTotalRial.lt(0)) {
        throw new BadRequestException(
          'SELL receivable cannot be negative — fee exceeds gold commercial value',
        );
      }
    }

    return {
      side,
      goldCommercialRial: bases.goldCommercialRial,
      charges,
      feeTotalRial,
      customerTotalRial,
      payableRial,
      receivableRial,
    };
  }

  async persistSnapshots(
    tx: Prisma.TransactionClient,
    orderId: string,
    breakdown: FeeBreakdown,
  ): Promise<void> {
    if (breakdown.charges.length === 0) return;

    await tx.transactionChargeSnapshot.createMany({
      data: breakdown.charges.map((c, index) => ({
        orderId,
        code: c.code,
        labelFa: c.labelFa,
        side: c.side,
        mode: c.mode,
        rateValue: c.rateValue,
        calculationBase: c.calculationBase,
        baseAmount: c.baseAmount,
        amount: c.amount,
        policyId: c.policyId,
        sortOrder: index,
      })),
    });
  }

  async listSnapshotsForOrder(orderId: string): Promise<ChargeLine[]> {
    const rows = await this.prisma.transactionChargeSnapshot.findMany({
      where: { orderId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r) => ({
      code: r.code as FeeChargeCode,
      labelFa: r.labelFa,
      side: r.side as TradeSide,
      mode: r.mode as FeeMode,
      rateValue: new Decimal(r.rateValue.toString()),
      calculationBase: (r.calculationBase as FeeCalculationBase | null) ?? null,
      baseAmount: new Decimal(r.baseAmount.toString()),
      amount: new Decimal(r.amount.toString()),
      policyId: r.policyId,
    }));
  }

  private computeLine(
    policy: FeePolicyEntity,
    side: TradeSide,
    bases: PricingBases,
  ): ChargeLine {
    let baseAmount = new Decimal(0);
    let amount = new Decimal(0);

    if (policy.mode === FeeMode.FIXED) {
      amount = policy.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      baseAmount = new Decimal(0);
    } else if (policy.mode === FeeMode.PERCENTAGE) {
      if (!policy.calculationBase) {
        throw new BadRequestException(
          'PERCENTAGE fee requires an explicitly defined calculationBase',
        );
      }
      baseAmount = this.resolveBase(policy.calculationBase, bases);
      amount = baseAmount
        .times(policy.value)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    if (amount.lt(0)) {
      throw new BadRequestException('Fee amount cannot be negative');
    }

    const defaultLabel =
      side === TradeSide.BUY ? 'کارمزد خرید' : 'کارمزد فروش';

    return {
      code: policy.code,
      labelFa: policy.labelFa || defaultLabel,
      side,
      mode: policy.mode,
      rateValue: policy.value,
      calculationBase: policy.calculationBase,
      baseAmount,
      amount,
      policyId: policy.id,
    };
  }

  private resolveBase(base: FeeCalculationBase, bases: PricingBases): Decimal {
    switch (base) {
      case FeeCalculationBase.GOLD_VALUE_STEP4:
        return bases.step4AfterWeight;
      case FeeCalculationBase.AFTER_GROUP_RULE_STEP5:
        return bases.step5AfterGroupRule;
      case FeeCalculationBase.GOLD_COMMERCIAL_TOTAL:
        return bases.goldCommercialRial;
      default:
        throw new BadRequestException(`Unknown fee calculation base: ${base}`);
    }
  }
}
