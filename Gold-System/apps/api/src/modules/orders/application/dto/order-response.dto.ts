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

  /** Order total in Rial — serialized as string to preserve Decimal precision */
  totalAmountRial: string;
  /** Credit reserved from CustomerAccount — 0 until SUBMITTED */
  reservedAmountRial: string;

  weightGrams: string; // Decimal as string
  purityRatio: string; // Decimal as string
  customerType: CustomerType | null;

  submittedAt: Date | null;
  cancelledAt: Date | null;
  rejectedAt: Date | null;
  cancellationReason: string | null;
  rejectionReason: string | null;

  createdAt: Date;
  updatedAt: Date;

  items: OrderItemResponseDto[];
}
