import { VerificationStatus } from '@gold/shared-types';

/**
 * CustomerDocument domain entity
 *
 * docs/21-business-decisions.md §7
 * BR-S03: access restricted to KYC Reviewer, Store Manager, Accountant
 * §7.3: every view/download MUST generate an AuditLog entry
 */
export class CustomerDocumentEntity {
  readonly id: string;
  readonly customerId: string;
  readonly documentType: string;
  readonly fileKey: string;
  readonly originalFileKey: string | null;
  readonly processedFileKey: string | null;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly fileSizeBytes: number;
  readonly status: VerificationStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    customerId: string;
    documentType: string;
    fileKey: string;
    originalFileKey?: string | null;
    processedFileKey?: string | null;
    fileName: string;
    fileMimeType: string;
    fileSizeBytes: number;
    status: VerificationStatus;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    rejectionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, {
      ...props,
      originalFileKey: props.originalFileKey ?? null,
      processedFileKey: props.processedFileKey ?? null,
    });
  }

  canBeReviewed(): boolean {
    return (
      this.status === VerificationStatus.PENDING || this.status === VerificationStatus.UNDER_REVIEW
    );
  }
}
