import { TradeStatus } from '@gold/shared-types';
import { TradeEntity } from '../../domain/entities/trade.entity';
import { TradeItemEntity } from '../../domain/entities/trade-item.entity';

/**
 * Trade Item Response DTO — Phase 3.6
 *
 * External representation of a trade line item.
 * All monetary/weight values as strings to preserve Decimal precision.
 */
export class TradeItemResponseDto {
  id: string;
  tradeId: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string;
  totalPriceRial: string;
  description: string | null;
  createdAt: Date;

  static fromEntity(entity: TradeItemEntity): TradeItemResponseDto {
    const dto = new TradeItemResponseDto();
    dto.id = entity.id;
    dto.tradeId = entity.tradeId;
    dto.weightGrams = entity.weightGrams.toFixed(6);
    dto.purityRatio = entity.purityRatio.toFixed(6);
    dto.unitPriceRial = entity.unitPriceRial.toFixed(6);
    dto.totalPriceRial = entity.totalPriceRial.toFixed(2);
    dto.description = entity.description;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * Trade Response DTO — Phase 3.6
 *
 * External representation of a Trade.
 *
 * CUSTOMER VISIBILITY:
 *   Customers see their own Trades with commercial terms.
 *   Staff see all Trades including reversal details.
 *
 * IMMUTABILITY: Financial fields reflect the locked snapshot at confirmation.
 *   They are never updated. The lockedTermsSnapshot field provides the full
 *   Phase 4 accounting reference.
 *
 * All monetary/weight values returned as strings to preserve Decimal precision.
 */
export class TradeResponseDto {
  id: string;
  tradeNumber: string;
  orderId: string;
  quotationId: string;
  customerId: string;
  pricingCalculationId: string;
  status: TradeStatus;

  // Immutable commercial terms (snapshot at confirmation)
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;
  unitPriceRial: string;
  step1BasePrice: string | null;
  wageAmount: string | null;
  profitAmount: string | null;
  taxAmount: string | null;
  discountAmount: string | null;
  roundingAmount: string | null;
  isComplete: boolean;
  customerType: string | null;

  /** Full locked snapshot — for Phase 4 accounting integration reference */
  lockedTermsSnapshot: Record<string, unknown>;

  // Confirmation tracking
  confirmedByUserId: string;
  confirmedAt: Date;

  // Reversal tracking (null until status = REVERSED)
  reversedByUserId: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;

  items: TradeItemResponseDto[];

  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: TradeEntity): TradeResponseDto {
    const dto = new TradeResponseDto();
    dto.id = entity.id;
    dto.tradeNumber = entity.tradeNumber;
    dto.orderId = entity.orderId;
    dto.quotationId = entity.quotationId;
    dto.customerId = entity.customerId;
    dto.pricingCalculationId = entity.pricingCalculationId;
    dto.status = entity.status;
    dto.totalAmountRial = entity.totalAmountRial.toFixed(2);
    dto.weightGrams = entity.weightGrams.toFixed(6);
    dto.purityRatio = entity.purityRatio.toFixed(6);
    dto.unitPriceRial = entity.unitPriceRial.toFixed(6);
    dto.step1BasePrice = entity.step1BasePrice ? entity.step1BasePrice.toFixed(6) : null;
    dto.wageAmount = entity.wageAmount ? entity.wageAmount.toFixed(2) : null;
    dto.profitAmount = entity.profitAmount ? entity.profitAmount.toFixed(2) : null;
    dto.taxAmount = entity.taxAmount ? entity.taxAmount.toFixed(2) : null;
    dto.discountAmount = entity.discountAmount ? entity.discountAmount.toFixed(2) : null;
    dto.roundingAmount = entity.roundingAmount ? entity.roundingAmount.toFixed(2) : null;
    dto.isComplete = entity.isComplete;
    dto.customerType = entity.customerType;
    dto.lockedTermsSnapshot = entity.lockedTermsSnapshot;
    dto.confirmedByUserId = entity.confirmedByUserId;
    dto.confirmedAt = entity.confirmedAt;
    dto.reversedByUserId = entity.reversedByUserId;
    dto.reversedAt = entity.reversedAt;
    dto.reversalReason = entity.reversalReason;
    dto.items = entity.items.map((i) => TradeItemResponseDto.fromEntity(i));
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

/**
 * Paginated list response for Trades
 */
export class TradeListResponseDto {
  trades: TradeResponseDto[];
  total: number;
  page: number;
  limit: number;
}
