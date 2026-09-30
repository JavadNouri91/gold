import { CustomerStatus, CustomerType, VerificationStatus } from '@gold/shared-types';
import {
  ALLOWED_KYC_MIME_TYPES,
  MAX_KYC_FILE_SIZE_BYTES,
} from '../../../common/storage/storage.service';

/**
 * Customer-facing view of the existing KYC records.
 *
 * Stored states stay VerificationStatus and CustomerStatus.
 * `phase` is derived for the portal and is not a new persisted status.
 *
 * Backend flow (KYCVerificationEntity):
 *   PENDING → UNDER_REVIEW → APPROVED
 *                          └→ REJECTED
 * A rejected document can be submitted again. That returns the case to
 * SUBMITTED until a reviewer starts a new review.
 */

export type KycPhase =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'NEEDS_CORRECTION';

export type KycDocumentDisplayStatus =
  'NOT_UPLOADED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION';

export interface KycRequirementDefinition {
  type: string;
  label: string;
  requiredFor: 'all' | 'PARTNER';
}

/** docs/21 §7.1 — same set the staff panel already requires. */
export const KYC_REQUIREMENTS: KycRequirementDefinition[] = [
  { type: 'national_id_front', label: 'روی کارت ملی', requiredFor: 'all' },
  { type: 'national_id_back', label: 'پشت کارت ملی', requiredFor: 'all' },
  { type: 'birth_certificate', label: 'شناسنامه', requiredFor: 'all' },
  { type: 'proof_of_address', label: 'مدرک محل سکونت', requiredFor: 'all' },
  { type: 'selfie_with_id', label: 'سلفی همراه با مدرک شناسایی', requiredFor: 'all' },
  { type: 'personal_photo', label: 'عکس پرسنلی', requiredFor: 'all' },
  { type: 'business_registration', label: 'جواز کسب', requiredFor: 'PARTNER' },
];

const LEGACY_LABELS: Record<string, string> = {
  NATIONAL_ID: 'کارت ملی',
  BIRTH_CERTIFICATE: 'شناسنامه',
  PASSPORT: 'پاسپورت',
  DRIVER_LICENSE: 'گواهینامه',
  UTILITY_BILL: 'قبض آب، برق یا گاز',
  BANK_STATEMENT: 'صورت‌حساب بانکی',
};

export function kycDocumentLabel(type: string): string {
  return KYC_REQUIREMENTS.find((item) => item.type === type)?.label ?? LEGACY_LABELS[type] ?? type;
}

export function requiredKycTypes(
  customerType: string | null | undefined,
): KycRequirementDefinition[] {
  return KYC_REQUIREMENTS.filter(
    (item) => item.requiredFor === 'all' || item.requiredFor === customerType,
  );
}

const VERIFIED_CUSTOMER_STATUSES = new Set<string>([
  CustomerStatus.APPROVED,
  CustomerStatus.ACTIVE,
  CustomerStatus.SUSPENDED,
  CustomerStatus.BLOCKED,
]);

export interface WorkflowDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  status: VerificationStatus;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface WorkflowVerification {
  id: string;
  status: VerificationStatus;
  decisionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowCustomer {
  status: CustomerStatus | string;
  type: CustomerType | string | null;
  firstName: string;
  lastName: string;
  nationalId: string;
  rejectionReason: string | null;
  createdAt: Date;
}

export interface OwnKycDocumentView {
  type: string;
  label: string;
  required: boolean;
  canUpload: boolean;
  canDelete: boolean;
  displayStatus: KycDocumentDisplayStatus;
  file: {
    id: string;
    fileName: string;
    fileMimeType: string;
    fileSizeBytes: number;
    status: VerificationStatus;
    rejectionReason: string | null;
    createdAt: string;
    reviewedAt: string | null;
  } | null;
}

export interface OwnKycHistoryEvent {
  id: string;
  occurredAt: string;
  title: string;
  statusLabel: string;
  tone: 'done' | 'pending' | 'rejected';
  description: string;
}

export interface OwnKycView {
  phase: KycPhase;
  identityComplete: boolean;
  customerStatus: string;
  rejectionReason: string | null;
  submittedAt: string | null;
  upload: {
    maxBytes: number;
    mimeTypes: string[];
  };
  documents: OwnKycDocumentView[];
  history: OwnKycHistoryEvent[];
}

export function deriveKycPhase(input: {
  customerStatus: string;
  verificationStatus: VerificationStatus | null;
  requiredTypes: string[];
  latestStatusByType: Map<string, VerificationStatus>;
}): KycPhase {
  const { customerStatus, verificationStatus, requiredTypes, latestStatusByType } = input;
  const states = requiredTypes.map((type) => latestStatusByType.get(type) ?? null);
  const anyRejected = states.some((status) => status === VerificationStatus.REJECTED);
  const anyMissing = states.some((status) => status === null);
  const anyUploaded = states.some((status) => status !== null);
  const allPresent = states.length > 0 && !anyMissing;
  const resubmitted =
    allPresent &&
    states.some((status) => status === VerificationStatus.PENDING) &&
    states.every(
      (status) => status === VerificationStatus.PENDING || status === VerificationStatus.APPROVED,
    );

  // A closed account status must not hide documents that were never sent.
  if (!anyMissing) {
    if (
      VERIFIED_CUSTOMER_STATUSES.has(customerStatus) ||
      verificationStatus === VerificationStatus.APPROVED
    ) {
      return 'VERIFIED';
    }

    if (
      customerStatus === CustomerStatus.UNDER_REVIEW ||
      verificationStatus === VerificationStatus.PENDING ||
      verificationStatus === VerificationStatus.UNDER_REVIEW
    ) {
      return 'UNDER_REVIEW';
    }
  }

  if (anyRejected) return 'NEEDS_CORRECTION';

  const caseRejected =
    customerStatus === CustomerStatus.REJECTED ||
    verificationStatus === VerificationStatus.REJECTED;
  if (caseRejected && !resubmitted) {
    if (anyMissing && anyUploaded) return 'NEEDS_CORRECTION';
    return 'REJECTED';
  }

  if (!anyUploaded) return 'NOT_STARTED';
  if (anyMissing) return 'IN_PROGRESS';
  return 'SUBMITTED';
}

export function documentDisplayStatus(
  status: VerificationStatus | null,
  phase: KycPhase,
): KycDocumentDisplayStatus {
  if (!status) return 'NOT_UPLOADED';
  if (status === VerificationStatus.APPROVED) return 'APPROVED';
  if (status === VerificationStatus.REJECTED) {
    return phase === 'NEEDS_CORRECTION' || phase === 'IN_PROGRESS' || phase === 'SUBMITTED'
      ? 'NEEDS_CORRECTION'
      : 'REJECTED';
  }
  if (phase === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  return 'SUBMITTED';
}

export function canUploadDocument(phase: KycPhase, status: VerificationStatus | null): boolean {
  if (status === VerificationStatus.APPROVED) return false;
  if (status === null) return true;
  if (phase === 'VERIFIED' || phase === 'UNDER_REVIEW' || phase === 'REJECTED') return false;
  if (phase === 'NEEDS_CORRECTION') {
    return status === null || status === VerificationStatus.REJECTED;
  }
  return (
    status === null ||
    status === VerificationStatus.PENDING ||
    status === VerificationStatus.REJECTED
  );
}

export function uploadBlockReason(input: {
  phase: KycPhase;
  documentType: string;
  status: VerificationStatus | null;
  allowedTypes: string[];
}): string | null {
  if (!input.allowedTypes.includes(input.documentType)) {
    return 'این نوع مدرک برای حساب شما لازم نیست.';
  }
  if (!canUploadDocument(input.phase, input.status)) {
    if (input.status === VerificationStatus.APPROVED) return 'این مدرک قبلاً تأیید شده است.';
    if (input.phase === 'UNDER_REVIEW') return 'مدارک در حال بررسی است و فعلاً قابل تغییر نیست.';
    if (input.phase === 'VERIFIED') return 'احراز هویت تأیید شده و نیازی به ارسال مدرک جدید نیست.';
    if (input.phase === 'REJECTED') return 'در وضعیت فعلی امکان ارسال مدرک وجود ندارد.';
    return 'فقط مدارک ردشده را می‌توانید دوباره ارسال کنید.';
  }
  return null;
}

/** A customer may withdraw a document only before a reviewer has started. */
export function canDeleteDocument(phase: KycPhase, status: VerificationStatus | null): boolean {
  if (status !== VerificationStatus.PENDING) return false;
  return (
    phase === 'NOT_STARTED' ||
    phase === 'IN_PROGRESS' ||
    phase === 'SUBMITTED' ||
    phase === 'NEEDS_CORRECTION'
  );
}

export function deleteBlockReason(input: {
  phase: KycPhase;
  status: VerificationStatus | null;
}): string | null {
  if (!input.status) return 'مدرکی برای حذف وجود ندارد.';
  if (canDeleteDocument(input.phase, input.status)) return null;
  if (input.status === VerificationStatus.APPROVED || input.phase === 'VERIFIED') {
    return 'مدرک تأییدشده قابل حذف نیست.';
  }
  if (input.phase === 'UNDER_REVIEW') return 'پس از شروع بررسی، حذف مدرک ممکن نیست.';
  if (input.status === VerificationStatus.REJECTED) {
    return 'مدرک ردشده حذف نمی‌شود. می‌توانید نسخه جدید بارگذاری کنید.';
  }
  return 'در این مرحله حذف مدرک ممکن نیست.';
}

function latestByType(documents: WorkflowDocument[]): Map<string, WorkflowDocument> {
  const latest = new Map<string, WorkflowDocument>();
  const ordered = [...documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const document of ordered) {
    if (!latest.has(document.documentType)) latest.set(document.documentType, document);
  }
  return latest;
}

function toFileView(document: WorkflowDocument): OwnKycDocumentView['file'] {
  return {
    id: document.id,
    fileName: document.fileName,
    fileMimeType: document.fileMimeType,
    fileSizeBytes: document.fileSizeBytes,
    status: document.status,
    rejectionReason: document.rejectionReason,
    createdAt: document.createdAt.toISOString(),
    reviewedAt: document.reviewedAt ? document.reviewedAt.toISOString() : null,
  };
}

export function buildOwnKycView(input: {
  customer: WorkflowCustomer;
  documents: WorkflowDocument[];
  verifications: WorkflowVerification[];
}): OwnKycView {
  const requirements = requiredKycTypes(input.customer.type);
  const latest = latestByType(input.documents);
  const latestVerification = [...input.verifications].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  const statusByType = new Map<string, VerificationStatus>();
  for (const [type, document] of latest) statusByType.set(type, document.status);

  const phase = deriveKycPhase({
    customerStatus: input.customer.status,
    verificationStatus: latestVerification?.status ?? null,
    requiredTypes: requirements.map((item) => item.type),
    latestStatusByType: statusByType,
  });

  const identityComplete = Boolean(
    input.customer.firstName.trim() &&
    input.customer.lastName.trim() &&
    input.customer.nationalId.trim(),
  );

  const documents: OwnKycDocumentView[] = requirements.map((item) => {
    const file = latest.get(item.type) ?? null;
    return {
      type: item.type,
      label: item.label,
      required: true,
      canUpload: canUploadDocument(phase, file?.status ?? null),
      canDelete: canDeleteDocument(phase, file?.status ?? null),
      displayStatus: documentDisplayStatus(file?.status ?? null, phase),
      file: file ? toFileView(file) : null,
    };
  });

  for (const [type, file] of latest) {
    if (requirements.some((item) => item.type === type)) continue;
    documents.push({
      type,
      label: kycDocumentLabel(type),
      required: false,
      canUpload: false,
      canDelete: false,
      displayStatus: documentDisplayStatus(file.status, phase),
      file: toFileView(file),
    });
  }

  const submittedAt = input.documents.reduce<Date | null>((latestDate, document) => {
    if (!latestDate || document.createdAt > latestDate) return document.createdAt;
    return latestDate;
  }, null);

  const showReason = phase === 'REJECTED' || phase === 'NEEDS_CORRECTION';
  const rejectionReason = showReason
    ? input.customer.rejectionReason || latestVerification?.decisionReason || null
    : null;

  return {
    phase,
    identityComplete,
    customerStatus: input.customer.status,
    rejectionReason,
    submittedAt: submittedAt ? submittedAt.toISOString() : null,
    upload: {
      maxBytes: MAX_KYC_FILE_SIZE_BYTES,
      mimeTypes: [...ALLOWED_KYC_MIME_TYPES],
    },
    documents,
    history: buildKycHistory({
      customer: input.customer,
      documents: input.documents,
      verifications: input.verifications,
    }),
  };
}

export function buildKycHistory(input: {
  customer: WorkflowCustomer;
  documents: WorkflowDocument[];
  verifications: WorkflowVerification[];
}): OwnKycHistoryEvent[] {
  const events: OwnKycHistoryEvent[] = [];

  events.push({
    id: `identity-${input.customer.createdAt.toISOString()}`,
    occurredAt: input.customer.createdAt.toISOString(),
    title: 'ثبت اطلاعات',
    statusLabel: 'تکمیل شده',
    tone: 'done',
    description: 'اطلاعات هویتی در سامانه ثبت شد.',
  });

  for (const document of input.documents) {
    const label = kycDocumentLabel(document.documentType);
    events.push({
      id: `submit-${document.id}`,
      occurredAt: document.createdAt.toISOString(),
      title: 'ارسال مدارک',
      statusLabel: 'تکمیل شده',
      tone: 'done',
      description: `«${label}» برای بررسی ارسال شد.`,
    });
    if (document.status === VerificationStatus.REJECTED && document.reviewedAt) {
      events.push({
        id: `reject-doc-${document.id}`,
        occurredAt: document.reviewedAt.toISOString(),
        title: 'اصلاح مدارک',
        statusLabel: 'نیازمند اصلاح',
        tone: 'rejected',
        description: document.rejectionReason
          ? `«${label}» نیاز به اصلاح دارد. ${document.rejectionReason}`
          : `«${label}» نیاز به اصلاح دارد.`,
      });
    }
  }

  for (const verification of input.verifications) {
    const open =
      verification.status === VerificationStatus.PENDING ||
      verification.status === VerificationStatus.UNDER_REVIEW;
    events.push({
      id: `review-${verification.id}`,
      occurredAt: verification.createdAt.toISOString(),
      title: 'شروع بررسی',
      statusLabel: open ? 'در حال بررسی' : 'تکمیل شده',
      tone: open ? 'pending' : 'done',
      description: 'بررسی مدارک آغاز شد.',
    });
    if (verification.status === VerificationStatus.APPROVED) {
      events.push({
        id: `approved-${verification.id}`,
        occurredAt: (verification.reviewedAt ?? verification.updatedAt).toISOString(),
        title: 'تأیید',
        statusLabel: 'تکمیل شده',
        tone: 'done',
        description: 'احراز هویت تأیید شد.',
      });
    }
    if (verification.status === VerificationStatus.REJECTED) {
      events.push({
        id: `rejected-${verification.id}`,
        occurredAt: (verification.reviewedAt ?? verification.updatedAt).toISOString(),
        title: 'رد',
        statusLabel: 'رد شده',
        tone: 'rejected',
        description: verification.decisionReason
          ? `درخواست احراز هویت رد شد. ${verification.decisionReason}`
          : 'درخواست احراز هویت رد شد.',
      });
    }
  }

  return events.sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
  );
}
