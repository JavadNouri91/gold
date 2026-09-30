import { CustomerStatus, VerificationStatus } from '@gold/shared-types';
import {
  buildOwnKycView,
  canDeleteDocument,
  canUploadDocument,
  deriveKycPhase,
  requiredKycTypes,
  uploadBlockReason,
  type WorkflowCustomer,
  type WorkflowDocument,
  type WorkflowVerification,
} from './kyc-workflow';

function customer(status: string, type: string | null = null): WorkflowCustomer {
  return {
    status,
    type,
    firstName: 'علی',
    lastName: 'رضایی',
    nationalId: '0012345678',
    rejectionReason: status === CustomerStatus.REJECTED ? 'تصویر کارت ملی خوانا نیست.' : null,
    createdAt: new Date('2026-09-26T10:00:00.000Z'),
  };
}

function doc(type: string, status: VerificationStatus, id = type): WorkflowDocument {
  return {
    id,
    documentType: type,
    fileName: `${type}.jpg`,
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 1200,
    status,
    rejectionReason: status === VerificationStatus.REJECTED ? 'تصویر خوانا نیست.' : null,
    createdAt: new Date('2026-09-27T11:02:00.000Z'),
    reviewedAt: status === VerificationStatus.PENDING ? null : new Date('2026-09-27T12:00:00.000Z'),
  };
}

const ALL = requiredKycTypes(null).map((item) => item.type);

function statuses(fill: VerificationStatus | null): Map<string, VerificationStatus> {
  const map = new Map<string, VerificationStatus>();
  for (const type of ALL) {
    if (fill) map.set(type, fill);
  }
  return map;
}

describe('deriveKycPhase', () => {
  const base = {
    requiredTypes: ALL,
    verificationStatus: null as VerificationStatus | null,
  };

  it('is not started when nothing has been uploaded', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.PENDING,
        latestStatusByType: new Map(),
      }),
    ).toBe('NOT_STARTED');
  });

  it('is in progress when only some required documents exist', () => {
    const latest = new Map<string, VerificationStatus>([
      ['national_id_front', VerificationStatus.PENDING],
    ]);
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.PENDING,
        latestStatusByType: latest,
      }),
    ).toBe('IN_PROGRESS');
  });

  it('is submitted when every required document is pending and review has not started', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.PENDING,
        latestStatusByType: statuses(VerificationStatus.PENDING),
      }),
    ).toBe('SUBMITTED');
  });

  it('is under review from the customer status or the open verification', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.UNDER_REVIEW,
        verificationStatus: VerificationStatus.UNDER_REVIEW,
        latestStatusByType: statuses(VerificationStatus.PENDING),
      }),
    ).toBe('UNDER_REVIEW');
  });

  it('is verified for an active customer', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.ACTIVE,
        verificationStatus: VerificationStatus.APPROVED,
        latestStatusByType: statuses(VerificationStatus.APPROVED),
      }),
    ).toBe('VERIFIED');
  });

  it('stays not started for an active customer who has not sent documents', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.ACTIVE,
        verificationStatus: null,
        latestStatusByType: new Map(),
      }),
    ).toBe('NOT_STARTED');
  });

  it('needs correction when a required document was rejected', () => {
    const latest = statuses(VerificationStatus.PENDING);
    latest.set('national_id_front', VerificationStatus.REJECTED);
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.REJECTED,
        verificationStatus: VerificationStatus.REJECTED,
        latestStatusByType: latest,
      }),
    ).toBe('NEEDS_CORRECTION');
  });

  it('returns to submitted after the rejected document is replaced', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.REJECTED,
        verificationStatus: VerificationStatus.REJECTED,
        latestStatusByType: statuses(VerificationStatus.PENDING),
      }),
    ).toBe('SUBMITTED');
  });

  it('is rejected when the case is rejected and documents cannot be corrected', () => {
    expect(
      deriveKycPhase({
        ...base,
        customerStatus: CustomerStatus.REJECTED,
        verificationStatus: VerificationStatus.REJECTED,
        latestStatusByType: statuses(VerificationStatus.APPROVED),
      }),
    ).toBe('REJECTED');
  });

  it('requires the business registration only for partners', () => {
    expect(requiredKycTypes(null).map((item) => item.type)).toContain('personal_photo');
    expect(requiredKycTypes('PARTNER').map((item) => item.type)).toContain('business_registration');
    expect(requiredKycTypes('HOUSEHOLD').map((item) => item.type)).not.toContain(
      'business_registration',
    );
  });
});

describe('upload rules', () => {
  it('blocks uploads while a review is open or after approval', () => {
    expect(canUploadDocument('UNDER_REVIEW', VerificationStatus.PENDING)).toBe(false);
    expect(canUploadDocument('VERIFIED', VerificationStatus.APPROVED)).toBe(false);
    expect(canUploadDocument('VERIFIED', null)).toBe(true);
    expect(canUploadDocument('UNDER_REVIEW', null)).toBe(true);
    expect(canUploadDocument('NEEDS_CORRECTION', VerificationStatus.REJECTED)).toBe(true);
    expect(canUploadDocument('IN_PROGRESS', null)).toBe(true);
  });

  it('allows withdrawal only before review and replacement after rejection', () => {
    expect(canDeleteDocument('SUBMITTED', VerificationStatus.PENDING)).toBe(true);
    expect(canDeleteDocument('IN_PROGRESS', VerificationStatus.PENDING)).toBe(true);
    expect(canDeleteDocument('UNDER_REVIEW', VerificationStatus.PENDING)).toBe(false);
    expect(canDeleteDocument('VERIFIED', VerificationStatus.APPROVED)).toBe(false);
    expect(canDeleteDocument('NEEDS_CORRECTION', VerificationStatus.REJECTED)).toBe(false);
    expect(canUploadDocument('NEEDS_CORRECTION', VerificationStatus.REJECTED)).toBe(true);
  });

  it('explains why a document cannot be replaced', () => {
    expect(
      uploadBlockReason({
        phase: 'UNDER_REVIEW',
        documentType: 'national_id_front',
        status: VerificationStatus.PENDING,
        allowedTypes: ALL,
      }),
    ).toMatch(/در حال بررسی/);
    expect(
      uploadBlockReason({
        phase: 'IN_PROGRESS',
        documentType: 'passport',
        status: null,
        allowedTypes: ALL,
      }),
    ).toMatch(/لازم نیست/);
  });
});

describe('buildOwnKycView', () => {
  it('omits storage keys and builds history from the real records', () => {
    const verification: WorkflowVerification = {
      id: 'ver-1',
      status: VerificationStatus.UNDER_REVIEW,
      decisionReason: null,
      reviewedAt: null,
      createdAt: new Date('2026-09-27T11:30:00.000Z'),
      updatedAt: new Date('2026-09-27T11:30:00.000Z'),
    };
    const view = buildOwnKycView({
      customer: customer(CustomerStatus.UNDER_REVIEW),
      documents: ALL.map((type) => doc(type, VerificationStatus.PENDING)),
      verifications: [verification],
    });

    expect(view.phase).toBe('UNDER_REVIEW');
    expect(view.documents).toHaveLength(ALL.length);
    expect(view.documents.every((item) => item.displayStatus === 'UNDER_REVIEW')).toBe(true);
    expect(view.documents.every((item) => item.canUpload === false)).toBe(true);
    expect(view.documents.every((item) => item.canDelete === false)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/fileKey|signedUrl|reviewerId/);
    expect(view.history.some((event) => event.title === 'شروع بررسی')).toBe(true);
    expect(view.history.some((event) => event.title === 'ثبت اطلاعات')).toBe(true);
    expect(view.history.some((event) => event.title === 'ارسال مدارک')).toBe(true);
    expect(view.upload.maxBytes).toBe(10 * 1024 * 1024);
  });

  it('keeps an empty upload list as not started with no fake submission date', () => {
    const view = buildOwnKycView({
      customer: customer(CustomerStatus.PENDING),
      documents: [],
      verifications: [],
    });
    expect(view.phase).toBe('NOT_STARTED');
    expect(view.submittedAt).toBeNull();
    expect(view.documents.every((item) => item.file === null && item.canUpload)).toBe(true);
    expect(view.history).toHaveLength(1);
  });

  it('lets an active customer upload documents that were never sent', () => {
    const view = buildOwnKycView({
      customer: customer(CustomerStatus.ACTIVE),
      documents: [],
      verifications: [],
    });
    expect(view.phase).toBe('NOT_STARTED');
    expect(view.documents.every((item) => item.canUpload)).toBe(true);
  });
});
