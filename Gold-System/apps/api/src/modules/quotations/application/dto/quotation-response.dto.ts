import { QuotationStatus } from '@gold/shared-types';

export class QuotationItemResponseDto {
  id: string;
  quotationId: string;
  weightGrams: string; // Decimal as string — BR-P05
  purityRatio: string; // Decimal as string
  unitPriceRial: string; // Decimal as string
  totalPriceRial: string; // Decimal as string
  description: string | null;
  createdAt: Date;
}

export class QuotationResponseDto {
  id: string;
  quotationNumber: string;
  orderId: string;
  customerId: string;
  pricingCalculationId: string;
  version: number;
  status: QuotationStatus;

  /** All monetary/weight values serialized as strings — BR-P05 (never Float) */
  totalAmountRial: string;
  weightGrams: string;
  purityRatio: string;

  /** Pipeline snapshot values — null if BLOCKED (§13.2/§13.3) */
  step1BasePrice: string | null;
  wageAmount: string | null;
  discountAmount: string | null;
  roundingAmount: string | null;

  /**
   * false while profit (§13.2) and tax (§13.3) remain OPEN.
   * The totalAmountRial excludes those until decisions are made.
   */
  isComplete: boolean;

  /** true if the quotation document has been generated and is available for download */
  documentAvailable: boolean;

  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;

  items: QuotationItemResponseDto[];
}

export class QuotationDownloadResponseDto {
  quotationId: string;
  quotationNumber: string;
  /** Pre-signed S3/MinIO URL for the document (expires per STORAGE_SIGNED_URL_TTL_SECONDS) */
  downloadUrl: string;
  mimeType: string;
  expiresIn: string;
}
