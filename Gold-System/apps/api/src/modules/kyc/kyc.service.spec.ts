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

// ─── Mocks ─────────────────────────────────────────────────────
const mockKycRepo = {
  findById: jest.fn(),
  findLatestByCustomerId: jest.fn(),
  findAllByCustomerId: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
};

const mockDocRepo = {
  findByCustomerId: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
};

const mockCustomerRepo = {
  findById: jest.fn(),
  findByUserId: jest.fn(),
};

const mockCustomersService = {
  markUnderReview: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
};

const mockStorage = {
  upload: jest.fn(),
  getSignedUrl: jest.fn(),
  getObject: jest.fn(),
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
    it('generates signed URL and audits each document access when requested', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findByCustomerId.mockResolvedValue([makeDocument()]);
      mockStorage.getSignedUrl.mockResolvedValue('https://minio/signed/abc.jpg?token=xyz');

      const results = await service.getDocuments('cust-1', 'reviewer-1', true);

      // §7.3: each document URL generation audited
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_URL_GENERATED' }),
      );
      expect(results[0].signedUrl).toBe('https://minio/signed/abc.jpg?token=xyz');
    });

    it('does NOT include fileKey in document response (security)', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findByCustomerId.mockResolvedValue([makeDocument()]);

      const results = await service.getDocuments('cust-1', 'reviewer-1', false);

      expect((results[0] as unknown as Record<string, unknown>)['fileKey']).toBeUndefined();
    });
  });

  describe('decideDocument', () => {
    it('approves one document and audits the decision', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockDocRepo.updateStatus.mockResolvedValue(
        makeDocument({ status: VerificationStatus.APPROVED, reviewedBy: 'reviewer-1' }),
      );

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
      expect(result.status).toBe(VerificationStatus.APPROVED);
    });

    it('rejects a document only when a reason is present', async () => {
      await expect(
        service.decideDocument('cust-1', 'doc-1', { decision: KycDecision.REJECT }, 'reviewer-1'),
      ).rejects.toMatchObject({
        message: expect.stringContaining('reason must be provided'),
      });
    });
  });

  describe('readDocumentFile', () => {
    it('returns the stored file and audits the view', async () => {
      mockCustomerRepo.findById.mockResolvedValue(makeCustomer());
      mockDocRepo.findById.mockResolvedValue(makeDocument());
      mockStorage.getObject.mockResolvedValue(Buffer.from('image'));

      const file = await service.readDocumentFile('cust-1', 'doc-1', 'reviewer-1');

      expect(mockStorage.getObject).toHaveBeenCalledWith(
        'kyc-documents/cust-1/abc.jpg',
        'gold-kyc-documents',
      );
      expect(file.mimeType).toBe('image/jpeg');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'KYC_DOCUMENT_VIEWED' }),
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
