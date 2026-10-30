import Decimal from 'decimal.js';
import {
  CustomerType,
  FeeCalculationBase,
  FeeChargeCode,
  FeeChargeSide,
  FeeMode,
} from '@gold/shared-types';

export class FeePolicyEntity {
  readonly id: string;
  readonly customerType: CustomerType | null;
  readonly side: FeeChargeSide;
  readonly code: FeeChargeCode;
  readonly labelFa: string;
  readonly mode: FeeMode;
  readonly value: Decimal;
  readonly calculationBase: FeeCalculationBase | null;
  readonly enabled: boolean;
  readonly priority: number;
  readonly activeFrom: Date;
  readonly activeTo: Date | null;
  readonly status: string;

  constructor(props: {
    id: string;
    customerType: CustomerType | null;
    side: FeeChargeSide;
    code: FeeChargeCode;
    labelFa: string;
    mode: FeeMode;
    value: Decimal;
    calculationBase: FeeCalculationBase | null;
    enabled: boolean;
    priority: number;
    activeFrom: Date;
    activeTo: Date | null;
    status: string;
  }) {
    Object.assign(this, props);
  }

  isActiveAt(now = new Date()): boolean {
    if (this.status !== 'ACTIVE' || !this.enabled) return false;
    if (this.activeFrom > now) return false;
    if (this.activeTo && this.activeTo < now) return false;
    return true;
  }
}
