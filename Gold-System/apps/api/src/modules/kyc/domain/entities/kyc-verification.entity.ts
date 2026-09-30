import { VerificationStatus } from '@gold/shared-types';

/**
 * KYCVerification domain entity
 *
 * Workflow (docs/08-workflows.md §8.1):
 *   PENDING → UNDER_REVIEW → APPROVED
 *                          └→ REJECTED
 *
 * UC-03: Verify Customer — Reviewer/Operator
 */
export class KYCVerificationEntity {
  readonly id: string;
  readonly customerId: string;
  readonly status: VerificationStatus;
  readonly reviewerId: string | null;
  readonly decisionReason: string | null;
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    customerId: string;
    status: VerificationStatus;
    reviewerId: string | null;
    decisionReason: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
  }

  canStartReview(): boolean {
    return this.status === VerificationStatus.PENDING;
  }

  canDecide(): boolean {
    return this.status === VerificationStatus.UNDER_REVIEW;
  }

  isPending(): boolean {
    return this.status === VerificationStatus.PENDING;
  }

  isApproved(): boolean {
    return this.status === VerificationStatus.APPROVED;
  }

  isRejected(): boolean {
    return this.status === VerificationStatus.REJECTED;
  }
}
