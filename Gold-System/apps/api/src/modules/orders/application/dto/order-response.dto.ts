import { OrderStatus, CustomerType } from '@gold/shared-types';

export class OrderItemResponseDto {
  id: string;
  orderId: string;
  weightGrams: string; // Decimal as string — BR-P05
  purityRatio: string; // Decimal as string
  unitPriceRial: string; // Decimal as string
  totalPriceRial: string; // Decimal as string
  description: string | null;
  createdAt: Date;
}

export class OrderResponseDto {
  id: string;
  orderNumber: string;
  customerId: string;
  customerAccountId: string;
  pricingCalculationId: string | null;
  status: OrderStatus;

  /** Customer-facing net (BUY payable / SELL receivable) */
  totalAmountRial: string;
  /** Gold commercial (PricingCalculation.finalPrice) */
  goldAmountRial: string;
  /** Transaction fee total */
  feeAmountRial: string;
  /** Spot (pipeline step 1) at order creation — rial per gram */
  step1BasePrice: string | null;
  /** Wage/making charge locked on the pricing calculation */
  wageAmount: string | null;
  /** Credit reserved from CustomerAccount — 0 until SUBMITTED */
  reservedAmountRial: string;
  /** Locked charge line items (fees) */
  charges?: Array<{
    code: string;
    labelFa: string;
    side: string;
    mode: string;
    rateValue: string;
    calculationBase: string | null;
    baseAmount: string;
    amount: string;
  }>;

  weightGrams: string; // Decimal as string
  purityRatio: string; // Decimal as string
  customerType: CustomerType | null;
  /** BUY/SELL from order item metadata. Null when unclassified. */
  side: 'BUY' | 'SELL' | null;
  /** Locked price per gram from the first order item. */
  unitPriceRial: string | null;

  submittedAt: Date | null;
  cancelledAt: Date | null;
  rejectedAt: Date | null;
  cancellationReason: string | null;
  rejectionReason: string | null;

  createdAt: Date;
  updatedAt: Date;

  items: OrderItemResponseDto[];
}
