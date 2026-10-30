import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { KycService } from './application/kyc.service';
import { KycVerificationRepository } from './infrastructure/repositories/kyc-verification.repository';
import { CustomerDocumentRepository } from './infrastructure/repositories/customer-document.repository';
import { CustomerRepository } from '../customers/infrastructure/repositories/customer.repository';
import { CustomersService } from '../customers/application/customers.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../audit/application/audit.service';
import { NotificationService } from '../notifications/application/notification.service';
import { KYCVerificationEntity } from './domain/entities/kyc-verification.entity';
import { CustomerDocumentEntity } from './domain/entities/customer-document.entity';
import { CustomerEntity } from '../customers/domain/entities/customer.entity';
import { VerificationStatus, CustomerStatus } from '@gold/shared-types';
import { KycDecision } from './application/dto/kyc-decision.dto';
import { requiredKycTypes } from './domain/kyc-workflow';

// ─── Helpers ───────────────────────────────────────────────────
function makeVerification(
  overrides: Partial<ConstructorParameters<typeof KYCVerificationEntity>[0]> = {},
): KYCVerificationEntity {
  return new KYCVerificationEntity({
    id: 'kyc-1',
    customerId: 'cust-1',
    status: VerificationStatus.PENDING,
    reviewerId: null,
    decisionReason: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeCustomer(status = CustomerStatus.PENDING): CustomerEntity {
  return new CustomerEntity({
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    userId: 'user-1',
    firstName: 'علی',
    lastName: 'محمدی',
    nationalId: '0012345678',
    mobile: '09123456789',
    email: null,
    dateOfBirth: null,
    address: null,
    type: null,
    status,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

function makeDocument(
  overrides: Partial<ConstructorParameters<typeof CustomerDocumentEntity>[0]> = {},
): CustomerDocumentEntity {
  return new CustomerDocumentEntity({
    id: 'doc-1',
    customerId: 'cust-1',
    documentType: 'national_id_front',
    fileKey: 'kyc-documents/cust-1/abc.jpg',
    fileName: 'id_front.jpg',
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 500_000,
    status: VerificationStatus.PENDING,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeRequiredDocuments(
  status: VerificationStatus = VerificationStatus.PENDING,
): CustomerDocumentEntity[] {
  return requiredKycTypes(null).map((requirement, index) =>
    makeDocument({
      id: `doc-${index + 1}`,
      documentType: requirement.type,
      status,
    }),
  );
}

// ─── Mocks ─────────────────────────────────────────────────────
const mockKycRepo = {
  findById: jest.fn(),
  findLatestByCustomerId: jest.fn(),
  findLatestPerCustomer: jest.fn(),
  findAllByCustomerId: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
};

const mockDocRepo = {
  findByCustomerId: jest.fn(),
  findLatestPerCustomerAndType: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  replaceFile: jest.fn(),
  updateProcessedFile: jest.fn(),
  deleteById: jest.fn(),
};

const mockCustomerRepo = {
  findById: jest.fn(),
  findByIds: jest.fn(),
  findAll: jest.fn(),
  findByUserId: jest.fn(),
  updateStatus: jest.fn(),
  updateAccountStatus: jest.fn(),
};

const mockCustomersService = {
  markUnderReview: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
};

const mockStorage = {
  upload: jest.fn(),
  getObject: jest.fn(),
  delete: jest.fn(),
  kycBucket: 'gold-kyc-documents',
};

const mockAudit = {
  log: jest.fn(),
};

// ─── Test suite ────────────────────────────────────────────────
describe('KycService', () => {
  let service: KycService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: KycVerificationRepository, useValue: mockKycRepo },
        { provide: CustomerDocumentRepository, useValue: mockDocRepo },
        { provide: CustomerRepository, useValue: mockCustomerRepo },
        { provide: CustomersService, useValue: mockCustomersService },
        { provide: StorageService, useValue: mockStorage },
        { provide: AuditService, useValue: mockAudit },
        { provide: NotificationService, useValue: { dispatch: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  // ── submitDocument ──────────────────────────────────────────
  describe('submitDocument', () => {
    const validFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'id_front.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 500_000,
      buffer: Buffer.from('fake-image-data'),
      destination: '',
      filename: '',
      path: '',
      stream: null as unknown as import('stream').Readable,
    };

    it('throws NotFoundException when customer does not exist', async () => {
      mockCustomerRepo.findById.mockResolvedValue(null);

      await expect(
        service.submitDocument({
          customerId: 'nonexistent',
          documentType: 'national_id_front',
          file: validFile,
          actorId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for disallowed MIME type', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());

      await expect(
        service.submitDocument({
          customerId: 'cust-1',
          documentType: 'national_id_front',
          file: { ...validFile, mimetype: 'image/gif' },
          actorId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file exceeds 10 MB', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());

      await expect(
        service.submitDocument({
          customerId: 'cust-1',
          documentType: 'national_id_front',
          file: { ...validFile, size: 11 * 1024 * 1024 },
          actorId: 'user-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores document and audits on success', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockStorage.upload.mockResolvedValue({
        key: 'kyc-documents/cust-1/abc.jpg',
        bucket: 'gold-kyc',
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 500_000,
      });
      mockDocRepo.create.mockResolvedValue(makeDocument());

      const result = await service.submitDocument({
        customerId: 'cust-1',
        documentType: 'national_id_front',
        file: validFile,
        actorId: 'user-1',
      });

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'kyc-documents/cust-1' }),
      );
      expect(mockDocRepo.create).toHaveBeenCalled();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_SUBMITTED' }),
      );
      expect(result.documentType).toBe('national_id_front');
    });
  });

  describe('submitStaffDocument', () => {
    const validFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'id_front.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 500_000,
      buffer: Buffer.from('fake-image-data'),
      destination: '',
      filename: '',
      path: '',
      stream: null as unknown as import('stream').Readable,
    };

    it('stores a missing document on behalf of the customer during review', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockDocRepo.findByCustomerId.mockResolvedValue([]);
      mockStorage.upload.mockResolvedValue({
        key: 'kyc-documents/cust-1/abc.jpg',
        bucket: 'gold-kyc',
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 500_000,
      });
      mockDocRepo.create.mockResolvedValue(makeDocument());

      await service.submitStaffDocument({
        customerId: 'cust-1',
        documentType: 'national_id_front',
        file: validFile,
        actorId: 'staff-1',
      });

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'KYC_DOCUMENT_SUBMITTED',
          after: expect.objectContaining({ source: 'staff' }),
        }),
      );
    });

    it('replaces an approved document on behalf of the customer', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findByCustomerId.mockResolvedValue([
        makeDocument({ status: VerificationStatus.APPROVED }),
      ]);
      mockStorage.upload.mockResolvedValue({
        key: 'kyc-documents/cust-1/replacement.jpg',
        bucket: 'gold-kyc',
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 500_000,
      });
      mockDocRepo.create.mockResolvedValue(makeDocument());

      await service.submitStaffDocument({
        customerId: 'cust-1',
        documentType: 'national_id_front',
        file: validFile,
        actorId: 'staff-1',
      });

      expect(mockStorage.upload).toHaveBeenCalled();
    });
  });

  describe('deleteStaffDocument', () => {
    it('deletes an approved document and audits the action', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ status: VerificationStatus.APPROVED, originalFileKey: 'orig.jpg' }),
      );
      mockStorage.delete.mockResolvedValue(undefined);
      mockDocRepo.deleteById.mockResolvedValue(undefined);

      await service.deleteStaffDocument({
        customerId: 'cust-1',
        documentId: 'doc-1',
        actorId: 'staff-1',
      });

      expect(mockStorage.delete).toHaveBeenCalled();
      expect(mockDocRepo.deleteById).toHaveBeenCalledWith('doc-1');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_DELETED_BY_STAFF' }),
      );
    });
  });

  // ── startReview ────────────────────────────────────────────
  describe('startReview', () => {
    it('throws NotFoundException when customer does not exist', async () => {
      mockCustomerRepo.findById.mockResolvedValue(null);
      await expect(service.startReview('unknown', 'reviewer-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BusinessRuleException when active review already exists', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );

      await expect(service.startReview('cust-1', 'reviewer-1')).rejects.toMatchObject({
        message: expect.stringContaining('already in progress'),
      });
    });

    it('creates KYC verification and moves customer to UNDER_REVIEW', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(null); // no existing
      mockDocRepo.findByCustomerId.mockResolvedValue(makeRequiredDocuments());
      mockKycRepo.create.mockResolvedValue(makeVerification());
      mockCustomersService.markUnderReview.mockResolvedValue(
        makeCustomer(CustomerStatus.UNDER_REVIEW),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW, reviewerId: 'reviewer-1' }),
      );

      const result = await service.startReview('cust-1', 'reviewer-1');

      expect(mockCustomersService.markUnderReview).toHaveBeenCalledWith('cust-1', 'reviewer-1');
      expect(result.status).toBe(VerificationStatus.UNDER_REVIEW);
    });

    it('does not start review while a required document is missing', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(null);
      mockDocRepo.findByCustomerId.mockResolvedValue([makeDocument()]);

      await expect(service.startReview('cust-1', 'reviewer-1')).rejects.toMatchObject({
        response: { code: 'KYC_DOCUMENTS_INCOMPLETE' },
      });
      expect(mockKycRepo.create).not.toHaveBeenCalled();
    });

    it('starts re-verification without downgrading an existing active account', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.ACTIVE));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(makeRequiredDocuments());
      mockKycRepo.create.mockResolvedValue(makeVerification());
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );

      const result = await service.startReview('cust-1', 'reviewer-1');

      expect(mockCustomersService.markUnderReview).not.toHaveBeenCalled();
      expect(result.status).toBe(VerificationStatus.UNDER_REVIEW);
    });
  });

  // ── makeDecision ────────────────────────────────────────────
  describe('makeDecision', () => {
    it('throws BusinessRuleException when rejecting without reason', async () => {
      await expect(
        service.makeDecision(
          'cust-1',
          { decision: KycDecision.REJECT, reason: undefined },
          'reviewer-1',
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('reason must be provided'),
      });
    });

    it('throws BusinessRuleException when no active review exists', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.PENDING));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(null);

      await expect(
        service.makeDecision('cust-1', { decision: KycDecision.APPROVE }, 'reviewer-1'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('No active KYC review'),
      });
    });

    it('approves KYC and calls customersService.approve', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED, reviewerId: 'reviewer-1' }),
      );
      mockCustomersService.approve.mockResolvedValue(makeCustomer(CustomerStatus.APPROVED));

      const result = await service.makeDecision(
        'cust-1',
        { decision: KycDecision.APPROVE },
        'reviewer-1',
      );

      expect(mockCustomersService.approve).toHaveBeenCalledWith('cust-1', 'reviewer-1', undefined);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_APPROVED' }),
      );
      expect(result.status).toBe(VerificationStatus.APPROVED);
    });

    it('does not approve the case while a required document is pending', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(makeRequiredDocuments());

      await expect(
        service.makeDecision('cust-1', { decision: KycDecision.APPROVE }, 'reviewer-1'),
      ).rejects.toMatchObject({
        response: { code: 'KYC_DOCUMENTS_NOT_APPROVED' },
      });
      expect(mockKycRepo.updateStatus).not.toHaveBeenCalled();
      expect(mockCustomersService.approve).not.toHaveBeenCalled();
    });

    it('approves re-verification without changing an existing active account', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.ACTIVE));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED }),
      );

      const result = await service.makeDecision(
        'cust-1',
        { decision: KycDecision.APPROVE },
        'reviewer-1',
      );

      expect(mockCustomersService.approve).not.toHaveBeenCalled();
      expect(result.status).toBe(VerificationStatus.APPROVED);
    });

    it('rejects KYC with reason and calls customersService.reject', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({
          status: VerificationStatus.REJECTED,
          reviewerId: 'reviewer-1',
          decisionReason: 'Blurry ID',
        }),
      );
      mockCustomersService.reject.mockResolvedValue(makeCustomer(CustomerStatus.REJECTED));

      const result = await service.makeDecision(
        'cust-1',
        { decision: KycDecision.REJECT, reason: 'Blurry ID document' },
        'reviewer-1',
      );

      expect(mockCustomersService.reject).toHaveBeenCalledWith(
        'cust-1',
        'Blurry ID document',
        'reviewer-1',
        undefined,
      );
      expect(result.status).toBe(VerificationStatus.REJECTED);
    });
  });

  // ── getDocuments (§7.3 audit) ───────────────────────────────
  describe('getDocuments', () => {
    it('returns the authenticated download path and audits each document access when requested', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findByCustomerId.mockResolvedValue([makeDocument()]);

      const results = await service.getDocuments('cust-1', 'reviewer-1', true);

      // §7.3: each document URL generation audited
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_URL_GENERATED' }),
      );
      expect(results[0].signedUrl).toBe('/api/v1/customers/cust-1/documents/doc-1/file');
      // No S3/MinIO URL generation is performed anymore.
    });

    it('does NOT include fileKey in document response (security)', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findByCustomerId.mockResolvedValue([makeDocument()]);

      const results = await service.getDocuments('cust-1', 'reviewer-1', false);

      expect((results[0] as unknown as Record<string, unknown>)['fileKey']).toBeUndefined();
    });
  });

  describe('getReviewQueue', () => {
    it('includes an active customer whose latest required documents await decisions', async () => {
      mockDocRepo.findLatestPerCustomerAndType.mockResolvedValue([
        makeDocument({
          id: 'pending-front',
          documentType: 'national_id_front',
          status: VerificationStatus.PENDING,
          createdAt: new Date('2026-10-13T14:57:42.000Z'),
        }),
        makeDocument({
          id: 'viewed-photo',
          documentType: 'personal_photo',
          status: VerificationStatus.UNDER_REVIEW,
          createdAt: new Date('2026-10-13T15:02:20.000Z'),
        }),
        makeDocument({
          id: 'deprecated-address',
          documentType: 'proof_of_address',
          status: VerificationStatus.PENDING,
        }),
      ]);
      mockCustomerRepo.findAll.mockResolvedValue([makeCustomer(CustomerStatus.ACTIVE)]);
      mockKycRepo.findLatestPerCustomer.mockResolvedValue([]);

      const result = await service.getReviewQueue({ search: '۰۹۱۲۳۴۵۶۷۸۹' }, 'reviewer-1');

      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'cust-1',
          bucket: 'awaiting',
          kycDisplay: 'awaiting',
          nationalId: '0012345678',
          pendingDocuments: 1,
          viewedDocuments: 1,
        }),
      ]);
      expect(result.summary).toEqual({ verified: 0, unverified: 0, awaiting: 1 });
      expect(result.meta.total).toBe(1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_REVIEW_QUEUE_ACCESSED' }),
      );
    });

    it('returns the mixed queue when bucket is omitted and matches nationalId search', async () => {
      mockDocRepo.findLatestPerCustomerAndType.mockResolvedValue([]);
      mockCustomerRepo.findAll.mockResolvedValue([makeCustomer(CustomerStatus.ACTIVE)]);
      mockKycRepo.findLatestPerCustomer.mockResolvedValue([]);

      const result = await service.getReviewQueue({ search: '0012345678' }, 'reviewer-1');

      expect(result.items).toEqual([
        expect.objectContaining({
          id: 'cust-1',
          bucket: 'unverified',
          kycDisplay: 'unverified',
        }),
      ]);
      expect(result.summary).toEqual({ verified: 0, unverified: 1, awaiting: 0 });
    });

    it('exposes rejected display separately from unverified when verification was rejected', async () => {
      mockDocRepo.findLatestPerCustomerAndType.mockResolvedValue([]);
      mockCustomerRepo.findAll.mockResolvedValue([makeCustomer(CustomerStatus.ACTIVE)]);
      mockKycRepo.findLatestPerCustomer.mockResolvedValue([
        makeVerification({ status: VerificationStatus.REJECTED }),
      ]);

      const all = await service.getReviewQueue({}, 'reviewer-1');
      expect(all.items[0]).toEqual(
        expect.objectContaining({
          bucket: 'unverified',
          kycDisplay: 'rejected',
          verificationStatus: VerificationStatus.REJECTED,
        }),
      );

      const filtered = await service.getReviewQueue({ kycDisplay: 'rejected' }, 'reviewer-1');
      expect(filtered.items).toHaveLength(1);
      expect(filtered.items[0]?.kycDisplay).toBe('rejected');
    });
  });

  describe('getPendingReviewCount', () => {
    it('counts only customers whose required documents await review', async () => {
      mockDocRepo.findLatestPerCustomerAndType.mockResolvedValue([
        makeDocument({
          id: 'pending-front',
          documentType: 'national_id_front',
          status: VerificationStatus.PENDING,
        }),
      ]);
      mockCustomerRepo.findAll.mockResolvedValue([makeCustomer(CustomerStatus.ACTIVE)]);
      mockKycRepo.findLatestPerCustomer.mockResolvedValue([]);

      const result = await service.getPendingReviewCount();

      expect(result).toEqual({ awaiting: 1 });
      expect(mockAudit.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_REVIEW_QUEUE_ACCESSED' }),
      );
    });
  });

  describe('activateCustomer', () => {
    it('rejects activation while a required document is not approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockDocRepo.findByCustomerId.mockResolvedValue([
        makeDocument({ status: VerificationStatus.APPROVED }),
        ...makeRequiredDocuments(VerificationStatus.PENDING).slice(1),
      ]);

      await expect(service.activateCustomer('cust-1', 'reviewer-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'KYC_DOCUMENTS_NOT_APPROVED' }),
      });
      expect(mockCustomerRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('rejects activation for an already active customer', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.ACTIVE));

      await expect(service.activateCustomer('cust-1', 'reviewer-1')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CUSTOMER_ALREADY_ACTIVE' }),
      });
    });

    it('approves the KYC case and activates the customer when all documents are approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(makeVerification());
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED }),
      );
      mockCustomersService.approve.mockResolvedValue(makeCustomer(CustomerStatus.APPROVED));
      mockCustomerRepo.updateStatus.mockResolvedValue(makeCustomer(CustomerStatus.ACTIVE));

      const result = await service.activateCustomer('cust-1', 'reviewer-1');

      expect(result.status).toBe(CustomerStatus.ACTIVE);
      expect(mockKycRepo.updateStatus).toHaveBeenCalledWith(
        expect.any(String),
        VerificationStatus.APPROVED,
        'reviewer-1',
      );
      expect(mockCustomersService.approve).toHaveBeenCalledWith('cust-1', 'reviewer-1', undefined);
      expect(mockCustomerRepo.updateStatus).toHaveBeenCalledWith('cust-1', CustomerStatus.ACTIVE);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CUSTOMER_ACTIVATED' }),
      );
    });

    it('repairs a pending customer whose verification is already approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.PENDING));
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED }),
      );
      mockCustomersService.markUnderReview.mockResolvedValue(
        makeCustomer(CustomerStatus.UNDER_REVIEW),
      );
      mockCustomersService.approve.mockResolvedValue(makeCustomer(CustomerStatus.APPROVED));
      mockCustomerRepo.updateStatus.mockResolvedValue(makeCustomer(CustomerStatus.ACTIVE));

      const result = await service.activateCustomer('cust-1', 'reviewer-1');

      expect(result.status).toBe(CustomerStatus.ACTIVE);
      expect(mockCustomersService.markUnderReview).toHaveBeenCalledWith('cust-1', 'reviewer-1');
      expect(mockCustomersService.approve).toHaveBeenCalled();
    });
  });

  describe('decideDocument', () => {
    it('approves one document and audits the decision', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockDocRepo.updateStatus.mockResolvedValue(
        makeDocument({ status: VerificationStatus.APPROVED, reviewedBy: 'reviewer-1' }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue([
        makeDocument({ status: VerificationStatus.APPROVED }),
      ]);

      const result = await service.decideDocument(
        'cust-1',
        'doc-1',
        { decision: KycDecision.APPROVE },
        'reviewer-1',
      );

      expect(mockDocRepo.updateStatus).toHaveBeenCalledWith(
        'doc-1',
        VerificationStatus.APPROVED,
        'reviewer-1',
        undefined,
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_APPROVED' }),
      );
      expect(mockCustomersService.approve).not.toHaveBeenCalled();
      expect(result.status).toBe(VerificationStatus.APPROVED);
    });

    it('verifies the customer when every required document has been approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.UNDER_REVIEW));
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ id: 'doc-4', documentType: 'personal_photo' }),
      );
      mockDocRepo.updateStatus.mockResolvedValue(
        makeDocument({
          id: 'doc-4',
          documentType: 'personal_photo',
          status: VerificationStatus.APPROVED,
        }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED, reviewerId: 'reviewer-1' }),
      );
      mockCustomersService.approve.mockResolvedValue(makeCustomer(CustomerStatus.APPROVED));

      await service.decideDocument(
        'cust-1',
        'doc-4',
        { decision: KycDecision.APPROVE },
        'reviewer-1',
      );

      expect(mockKycRepo.updateStatus).toHaveBeenCalledWith(
        'kyc-1',
        VerificationStatus.APPROVED,
        'reviewer-1',
      );
      expect(mockCustomersService.approve).toHaveBeenCalledWith('cust-1', 'reviewer-1', undefined);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_APPROVED' }),
      );
    });

    it('approves the KYC case for a still-PENDING customer whose documents are approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer(CustomerStatus.PENDING));
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ id: 'doc-4', documentType: 'personal_photo' }),
      );
      mockDocRepo.updateStatus.mockResolvedValue(
        makeDocument({
          id: 'doc-4',
          documentType: 'personal_photo',
          status: VerificationStatus.APPROVED,
        }),
      );
      mockDocRepo.findByCustomerId.mockResolvedValue(
        makeRequiredDocuments(VerificationStatus.APPROVED),
      );
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED, reviewerId: 'reviewer-1' }),
      );
      mockCustomersService.markUnderReview.mockResolvedValue(
        makeCustomer(CustomerStatus.UNDER_REVIEW),
      );
      mockCustomersService.approve.mockResolvedValue(makeCustomer(CustomerStatus.APPROVED));

      await service.decideDocument(
        'cust-1',
        'doc-4',
        { decision: KycDecision.APPROVE },
        'reviewer-1',
      );

      expect(mockCustomersService.markUnderReview).toHaveBeenCalledWith('cust-1', 'reviewer-1');
      expect(mockCustomersService.approve).toHaveBeenCalledWith('cust-1', 'reviewer-1', undefined);
    });

    it('rejects a document only when a reason is present', async () => {
      await expect(
        service.decideDocument('cust-1', 'doc-1', { decision: KycDecision.REJECT }, 'reviewer-1'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('reason must be provided'),
      });
    });

    it('rejects a document when the reason is only whitespace', async () => {
      await expect(
        service.decideDocument(
          'cust-1',
          'doc-1',
          { decision: KycDecision.REJECT, reason: '          ' },
          'reviewer-1',
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('reason must be provided'),
      });
    });

    it('does not approve an already approved document again', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument({ status: VerificationStatus.APPROVED }));

      await expect(
        service.decideDocument('cust-1', 'doc-1', { decision: KycDecision.APPROVE }, 'reviewer-1'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('already been approved'),
      });
      expect(mockDocRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('does not reject an approved document until it is reopened', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument({ status: VerificationStatus.APPROVED }));

      await expect(
        service.decideDocument(
          'cust-1',
          'doc-1',
          { decision: KycDecision.REJECT, reason: 'تصویر کارت ملی خوانا نیست' },
          'reviewer-1',
        ),
      ).rejects.toMatchObject({
        message: expect.stringContaining('بازنگری تصویر'),
      });
      expect(mockDocRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('reopenDocument', () => {
    it('moves an approved document back to under review', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument({ status: VerificationStatus.APPROVED }));
      mockDocRepo.updateStatus.mockResolvedValue(
        makeDocument({ status: VerificationStatus.UNDER_REVIEW, reviewedBy: 'reviewer-1' }),
      );
      mockKycRepo.findLatestByCustomerId.mockResolvedValue(
        makeVerification({ status: VerificationStatus.APPROVED }),
      );
      mockKycRepo.updateStatus.mockResolvedValue(
        makeVerification({ status: VerificationStatus.UNDER_REVIEW }),
      );

      const result = await service.reopenDocument('cust-1', 'doc-1', 'reviewer-1');

      expect(mockDocRepo.updateStatus).toHaveBeenCalledWith(
        'doc-1',
        VerificationStatus.UNDER_REVIEW,
        'reviewer-1',
      );
      expect(mockKycRepo.updateStatus).toHaveBeenCalledWith(
        'kyc-1',
        VerificationStatus.UNDER_REVIEW,
        'reviewer-1',
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_REOPENED' }),
      );
      expect(result.status).toBe(VerificationStatus.UNDER_REVIEW);
    });

    it('does not reopen a document that is not approved', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument({ status: VerificationStatus.PENDING }));

      await expect(service.reopenDocument('cust-1', 'doc-1', 'reviewer-1')).rejects.toMatchObject({
        message: expect.stringContaining('تأییدشده'),
      });
      expect(mockDocRepo.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('replaceStaffDocumentImage', () => {
    const imageFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'id_front.jpg',
      encoding: '7bit',
      mimetype: 'image/jpeg',
      size: 12_000,
      buffer: Buffer.from('edited-image'),
      destination: '',
      filename: '',
      path: '',
      stream: null as unknown as import('stream').Readable,
    };

    it('keeps the original object and points fileKey at the edited image', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockStorage.upload.mockResolvedValue({
        key: 'kyc-documents/cust-1/edited.jpg',
        bucket: 'gold-kyc-documents',
        originalName: 'id_front.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 12_000,
      });
      mockDocRepo.replaceFile.mockResolvedValue(
        makeDocument({
          fileKey: 'kyc-documents/cust-1/edited.jpg',
          originalFileKey: 'kyc-documents/cust-1/abc.jpg',
        }),
      );

      const result = await service.replaceStaffDocumentImage(
        'cust-1',
        'doc-1',
        imageFile,
        'reviewer-1',
      );

      expect(mockDocRepo.replaceFile).toHaveBeenCalledWith(
        'doc-1',
        expect.objectContaining({
          fileKey: 'kyc-documents/cust-1/edited.jpg',
          originalFileKey: 'kyc-documents/cust-1/abc.jpg',
          processedFileKey: null,
        }),
      );
      expect(mockStorage.delete).not.toHaveBeenCalled();
      expect(result.hasOriginalFile).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_IMAGE_EDITED' }),
      );
    });
  });

  describe('saveProcessedPersonalPhoto', () => {
    const pngFile: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'photo-cutout.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 8_000,
      buffer: Buffer.from('png'),
      destination: '',
      filename: '',
      path: '',
      stream: null as unknown as import('stream').Readable,
    };

    it('stores a PNG cutout without replacing the review original', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ documentType: 'personal_photo', fileMimeType: 'image/jpeg' }),
      );
      mockStorage.upload.mockResolvedValue({
        key: 'kyc-documents/cust-1/processed/cutout.png',
        bucket: 'gold-kyc-documents',
        originalName: 'photo-cutout.png',
        mimeType: 'image/png',
        sizeBytes: 8_000,
      });
      mockDocRepo.updateProcessedFile.mockResolvedValue(
        makeDocument({
          documentType: 'personal_photo',
          processedFileKey: 'kyc-documents/cust-1/processed/cutout.png',
        }),
      );

      const result = await service.saveProcessedPersonalPhoto(
        'cust-1',
        'doc-1',
        pngFile,
        'reviewer-1',
      );

      expect(mockDocRepo.replaceFile).not.toHaveBeenCalled();
      expect(mockDocRepo.updateProcessedFile).toHaveBeenCalledWith(
        'doc-1',
        'kyc-documents/cust-1/processed/cutout.png',
      );
      expect(result.hasProcessedFile).toBe(true);
      expect(result.fileName).toBe('id_front.jpg');
    });

    it('does not process national-id images', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());

      await expect(
        service.saveProcessedPersonalPhoto('cust-1', 'doc-1', pngFile, 'reviewer-1'),
      ).rejects.toMatchObject({ message: expect.stringContaining('عکس پرسنلی') });
    });
  });

  describe('readDocumentFile', () => {
    it('marks a pending document as viewed and audits the staff view', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      const file = await service.readDocumentFile('cust-1', 'doc-1', 'reviewer-1');

      expect(mockStorage.getObject).toHaveBeenCalledWith(
        'kyc-documents/cust-1/abc.jpg',
        'gold-kyc-documents',
      );
      expect(mockDocRepo.updateStatus).toHaveBeenCalledWith(
        'doc-1',
        VerificationStatus.UNDER_REVIEW,
        'reviewer-1',
      );
      expect(file.mimeType).toBe('image/jpeg');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_VIEWED' }),
      );
    });

    it('does not mark a document viewed when its owner opens the preview', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      await service.readOwnDocumentFile('user-1', 'doc-1');

      expect(mockDocRepo.updateStatus).not.toHaveBeenCalled();
    });

    it('audits the owner preview as a viewed event without a URL-generation event', async () => {
      mockCustomerRepo.findByUserId.mockResolvedValue(makeCustomer());
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      await service.readOwnDocumentFile('user-1', 'doc-1');

      const viewed = mockAudit.log.mock.calls.filter((call: unknown[]) =>
        JSON.stringify(call[0]).includes('KYC_DOCUMENT_VIEWED'),
      );
      expect(viewed).toHaveLength(1);
      const urlGenerated = mockAudit.log.mock.calls.filter((call: unknown[]) =>
        JSON.stringify(call[0]).includes('KYC_DOCUMENT_URL_GENERATED'),
      );
      expect(urlGenerated).toHaveLength(0);
    });

    it('audits the original file view as KYC_DOCUMENT_ORIGINAL_VIEWED', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ originalFileKey: 'kyc-documents/cust-1/orig.jpg' }),
      );
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      await service.readDocumentFile(
        'cust-1',
        'doc-1',
        'reviewer-1',
        undefined,
        false,
        true,
        false,
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_ORIGINAL_VIEWED' }),
      );
    });

    it('audits the processed file view as KYC_DOCUMENT_PROCESSED_VIEWED', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(
        makeDocument({ processedFileKey: 'kyc-documents/cust-1/processed.png' }),
      );
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      await service.readDocumentFile(
        'cust-1',
        'doc-1',
        'reviewer-1',
        undefined,
        false,
        false,
        true,
      );

      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_PROCESSED_VIEWED' }),
      );
    });
  });

  // ── KYCVerificationEntity domain logic ──────────────────────
  describe('KYCVerificationEntity', () => {
    it('canStartReview is true only for PENDING status', () => {
      expect(makeVerification({ status: VerificationStatus.PENDING }).canStartReview()).toBe(true);
      expect(makeVerification({ status: VerificationStatus.UNDER_REVIEW }).canStartReview()).toBe(
        false,
      );
    });

    it('canDecide is true only for UNDER_REVIEW status', () => {
      expect(makeVerification({ status: VerificationStatus.UNDER_REVIEW }).canDecide()).toBe(true);
      expect(makeVerification({ status: VerificationStatus.PENDING }).canDecide()).toBe(false);
      expect(makeVerification({ status: VerificationStatus.APPROVED }).canDecide()).toBe(false);
    });
  });
});
