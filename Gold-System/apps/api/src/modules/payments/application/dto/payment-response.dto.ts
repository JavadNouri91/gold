import Decimal from 'decimal.js';
import { PaymentEntity, PaymentAllocationEntity } from '../../domain/entities/payment.entity';
import { SettlementEntity } from '../../../settlements/domain/entities/settlement.entity';

/**
 * Payment Response DTOs
 *
 * Serializable response shapes for Payment API endpoints.
 * All monetary values returned as strings to preserve Decimal precision.
 */

export class PaymentResponseDto {
  id: string;
  idempotencyKey: string;
  tradeId: string;
  customerId: string;
  method: string;
  amount: string;
  currency: string;
  status: string;
  referenceNumber: string | null;
  /** True when a receipt file is stored. The storage key is never returned. */
  hasReceipt: boolean;
  notes: string | null;
  receivedAt: string | null;
  recordedByUserId: string | null;
  validatedAt: string | null;
  validatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;

  static from(entity: PaymentEntity): PaymentResponseDto {
    const dto = new PaymentResponseDto();
    dto.id = entity.id;
    dto.idempotencyKey = entity.idempotencyKey;
    dto.tradeId = entity.tradeId;
    dto.customerId = entity.customerId;
    dto.method = entity.method;
    dto.amount = entity.amount.toFixed(2);
    dto.currency = entity.currency;
    dto.status = entity.status;
    dto.referenceNumber = entity.referenceNumber;
    dto.hasReceipt = Boolean(entity.receiptKey);
    dto.notes = entity.notes;
    dto.receivedAt = entity.receivedAt?.toISOString() ?? null;
    dto.recordedByUserId = entity.recordedByUserId;
    dto.validatedAt = entity.validatedAt?.toISOString() ?? null;
    dto.validatedByUserId = entity.validatedByUserId;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

export class PaymentAllocationResponseDto {
  id: string;
  paymentId: string;
  tradeId: string;
  amount: string;
  allocatedByUserId: string | null;
  allocatedAt: string;

  static from(entity: PaymentAllocationEntity): PaymentAllocationResponseDto {
    const dto = new PaymentAllocationResponseDto();
    dto.id = entity.id;
    dto.paymentId = entity.paymentId;
    dto.tradeId = entity.tradeId;
    dto.amount = entity.amount.toFixed(2);
    dto.allocatedByUserId = entity.allocatedByUserId;
    dto.allocatedAt = entity.allocatedAt.toISOString();
    return dto;
  }
}

export class TradePaymentStatusDto {
  tradeId: string;
  tradeTotal: string;
  totalAllocated: string;
  remaining: string;
  isFullyPaid: boolean;
  settlementStatus: string;
  payments: PaymentResponseDto[];
  allocations: PaymentAllocationResponseDto[];

  static build(params: {
    tradeId: string;
    tradeTotal: Decimal;
    totalAllocated: Decimal;
    settlementStatus: string;
    payments: PaymentEntity[];
    allocations: PaymentAllocationEntity[];
  }): TradePaymentStatusDto {
    const dto = new TradePaymentStatusDto();
    dto.tradeId = params.tradeId;
    dto.tradeTotal = params.tradeTotal.toFixed(2);
    dto.totalAllocated = params.totalAllocated.toFixed(2);
    dto.remaining = params.tradeTotal.minus(params.totalAllocated).toFixed(2);
    dto.isFullyPaid = params.totalAllocated.greaterThanOrEqualTo(params.tradeTotal);
    dto.settlementStatus = params.settlementStatus;
    dto.payments = params.payments.map(PaymentResponseDto.from);
    dto.allocations = params.allocations.map(PaymentAllocationResponseDto.from);
    return dto;
  }
}

export class SettlementResponseDto {
  id: string;
  tradeId: string;
  status: string;
  settledAmount: string;
  settledAt: string | null;
  settledByUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  static from(entity: SettlementEntity): SettlementResponseDto {
    const dto = new SettlementResponseDto();
    dto.id = entity.id;
    dto.tradeId = entity.tradeId;
    dto.status = entity.status;
    dto.settledAmount = entity.settledAmount.toFixed(2);
    dto.settledAt = entity.settledAt?.toISOString() ?? null;
    dto.settledByUserId = entity.settledByUserId;
    dto.notes = entity.notes;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

export class AllocatePaymentResponseDto {
  payment: PaymentResponseDto;
  allocation: PaymentAllocationResponseDto;
  settlement: SettlementResponseDto;
  wasAlreadyAllocated: boolean;
}

export class AmountCountDto {
  count: number;
  amountRial: string;
}

export class PaymentSummaryDto {
  totalPaid: AmountCountDto;
  successful: AmountCountDto;
  failed: AmountCountDto;
  reversed: AmountCountDto;
  /** True when the customer has any non-pending payment, ignoring the current filters. */
  hasAny: boolean;
}

/** Ledger row: a payment plus the related trade/order the customer can recognize. */
export class LedgerPaymentDto extends PaymentResponseDto {
  orderId: string | null;
  orderNumber: string | null;
  tradeNumber: string | null;
  relatedSide: 'BUY' | 'SELL' | null;
}
