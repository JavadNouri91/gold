import { AssignmentStatus } from '@gold/shared-types';

/**
 * Assignment response DTO.
 *
 * CUSTOMER VISIBILITY: This DTO is staff-only and MUST NOT be
 * returned to customer-facing endpoints.
 */
export class AssignmentResponseDto {
  id!: string;
  orderId!: string;
  quotationId!: string | null;

  assignedToId!: string; // userId of the reviewer
  assignedById!: string; // userId of the operator

  status!: AssignmentStatus;
  notes!: string | null;

  completedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Full review context returned for staff review endpoints.
 *
 * Contains all data a Reviewer needs to make a decision:
 * - Order details + items
 * - Customer profile + type + KYC status
 * - Active Quotation + pricing snapshot
 * - Reserved credit + account status
 *
 * CUSTOMER VISIBILITY: This DTO is staff-only.
 */
export class ReviewContextDto {
  order!: {
    id: string;
    orderNumber: string;
    status: string;
    totalAmountRial: string;
    reservedAmountRial: string;
    weightGrams: string;
    purityRatio: string;
    customerType: string | null;
    submittedAt: Date | null;
    createdAt: Date;
  };

  customer!: {
    id: string;
    customerNumber: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    mobile: string;
    type: string | null;
    status: string;
    kycStatus: string | null; // latest KYC verification status
  };

  account!: {
    id: string;
    status: string;
    creditLimitRial: string;
    reservedCreditRial: string;
    consumedCreditRial: string;
    availableCreditRial: string; // computed: limit - reserved - consumed
  } | null;

  quotation!: {
    id: string;
    quotationNumber: string;
    version: number;
    status: string;
    totalAmountRial: string;
    weightGrams: string;
    purityRatio: string;
    step1BasePrice: string | null;
    wageAmount: string | null;
    discountAmount: string | null;
    roundingAmount: string | null;
    isComplete: boolean;
    documentKey: string | null;
    generatedAt: Date;
  } | null;

  activeAssignment!: AssignmentResponseDto | null;
}
