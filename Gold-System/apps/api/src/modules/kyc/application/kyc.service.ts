import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { KycVerificationRepository } from '../infrastructure/repositories/kyc-verification.repository';
import { CustomerDocumentRepository } from '../infrastructure/repositories/customer-document.repository';
import {
  StorageService,
  ALLOWED_KYC_MIME_TYPES,
  MAX_KYC_FILE_SIZE_BYTES,
} from '../../../common/storage/storage.service';
import { AuditService } from '../../audit/application/audit.service';
import { CustomersService } from '../../customers/application/customers.service';
import { CustomerRepository } from '../../customers/infrastructure/repositories/customer.repository';
import { NotificationService } from '../../notifications/application/notification.service';
import { NotificationType } from '../../notifications/domain/constants/notification-types';
import { BusinessRuleException } from '../../../common/exceptions/business-rule.exception';
import { KYCVerificationEntity } from '../domain/entities/kyc-verification.entity';
import { CustomerDocumentEntity } from '../domain/entities/customer-document.entity';
import { KycDecisionDto, KycDecision } from './dto/kyc-decision.dto';
import { VerificationStatus } from '@gold/shared-types';
import {
  buildOwnKycView,
  deleteBlockReason,
  requiredKycTypes,
  uploadBlockReason,
  type OwnKycView,
  type WorkflowDocument,
  type WorkflowVerification,
} from '../domain/kyc-workflow';

export class DocumentResponseDto {
  id: string;
  customerId: string;
  documentType: string;
  fileName: string;
  fileMimeType: string;
  fileSizeBytes: number;
  status: VerificationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Signed URL — generated on demand; caller must audit access (§7.3) */
  signedUrl?: string;

  static fromEntity(entity: CustomerDocumentEntity, signedUrl?: string): DocumentResponseDto {
    const dto = new DocumentResponseDto();
    dto.id = entity.id;
    dto.customerId = entity.customerId;
    dto.documentType = entity.documentType;
    dto.fileName = entity.fileName;
    dto.fileMimeType = entity.fileMimeType;
    dto.fileSizeBytes = entity.fileSizeBytes;
    dto.status = entity.status;
    dto.reviewedBy = entity.reviewedBy;
    dto.reviewedAt = entity.reviewedAt;
    dto.rejectionReason = entity.rejectionReason;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    if (signedUrl !== undefined) dto.signedUrl = signedUrl;
    return dto;
  }
}

export class KycVerificationResponseDto {
  id: string;
  customerId: string;
  status: VerificationStatus;
  reviewerId: string | null;
  decisionReason: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: KYCVerificationEntity): KycVerificationResponseDto {
    const dto = new KycVerificationResponseDto();
    dto.id = entity.id;
    dto.customerId = entity.customerId;
    dto.status = entity.status;
    dto.reviewerId = entity.reviewerId;
    dto.decisionReason = entity.decisionReason;
    dto.reviewedAt = entity.reviewedAt;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly kycRepo: KycVerificationRepository,
    private readonly documentRepo: CustomerDocumentRepository,
    private readonly customerRepo: CustomerRepository,
    private readonly customersService: CustomersService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notificationService: NotificationService,
  ) {}

  // ----------------------------------------------------------------
  // UC-02: Submit Document — Customer uploads a KYC document
  // File stored in private S3 bucket; metadata stored in DB.
  // BR-S03: strict access control enforced at the endpoint level.
  // ----------------------------------------------------------------
  async submitDocument(params: {
    customerId: string;
    documentType: string;
    file: Express.Multer.File;
    actorId: string;
    ipAddress?: string;
  }): Promise<DocumentResponseDto> {
    const { customerId, documentType, file } = params;

    // Verify customer exists
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    // Validate file type
    if (!(ALLOWED_KYC_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} is not allowed. Allowed: ${ALLOWED_KYC_MIME_TYPES.join(', ')}`,
      );
    }

    // Validate file size
    if (file.size > MAX_KYC_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size ${file.size} bytes exceeds maximum of ${MAX_KYC_FILE_SIZE_BYTES} bytes (10 MB)`,
      );
    }

    // Upload to private bucket
    const stored = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      prefix: `kyc-documents/${customerId}`,
      bucket: this.storage.kycBucket,
    });

    // Store metadata in DB
    const docEntity = await this.documentRepo.create({
      customerId,
      documentType,
      fileKey: stored.key,
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      fileSizeBytes: file.size,
    });

    // Audit document submission
    await this.audit.log({
      actorId: params.actorId,
      action: 'KYC_DOCUMENT_SUBMITTED',
      entityType: 'CustomerDocument',
      entityId: docEntity.id,
      after: {
        customerId,
        documentType,
        fileName: file.originalname,
        fileSizeBytes: file.size,
        status: 'PENDING',
        // fileKey intentionally omitted from audit for security hygiene
      },
      ipAddress: params.ipAddress,
    });

    this.logger.log(
      `Document submitted: type=${documentType} customer=${customerId} docId=${docEntity.id}`,
    );

    return DocumentResponseDto.fromEntity(docEntity);
  }

  // ----------------------------------------------------------------
  // Get documents for a customer (staff only — BR-S03)
  // EVERY call to this method generates an AuditLog entry (§7.3)
  // ----------------------------------------------------------------
  async getDocuments(
    customerId: string,
    actorId: string,
    includeSignedUrls: boolean,
    ipAddress?: string,
  ): Promise<DocumentResponseDto[]> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const docs = await this.documentRepo.findByCustomerId(customerId);

    // §7.3: Audit every document list access
    await this.audit.log({
      actorId,
      action: 'KYC_DOCUMENTS_ACCESSED',
      entityType: 'Customer',
      entityId: customerId,
      after: { documentCount: docs.length, includeSignedUrls },
      ipAddress,
    });

    const responses: DocumentResponseDto[] = [];
    for (const doc of docs) {
      let signedUrl: string | undefined;
      if (includeSignedUrls) {
        signedUrl = await this.storage.getSignedUrl(doc.fileKey, this.storage.kycBucket);

        // §7.3: Audit every document access with signed URL generation
        await this.audit.log({
          actorId,
          action: 'KYC_DOCUMENT_URL_GENERATED',
          entityType: 'CustomerDocument',
          entityId: doc.id,
          after: { documentType: doc.documentType, customerId },
          ipAddress,
        });
      }
      responses.push(DocumentResponseDto.fromEntity(doc, signedUrl));
    }

    return responses;
  }

  // ----------------------------------------------------------------
  // Read one document file for inline review.
  // §7.3: every view is audited. The file stays in the private bucket.
  // ----------------------------------------------------------------
  async readDocumentFile(
    customerId: string,
    documentId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.customerId !== customerId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const buffer = await this.storage.getObject(doc.fileKey, this.storage.kycBucket);

    await this.audit.log({
      actorId,
      action: 'KYC_DOCUMENT_VIEWED',
      entityType: 'CustomerDocument',
      entityId: doc.id,
      after: { documentType: doc.documentType, customerId },
      ipAddress,
    });

    return { buffer, mimeType: doc.fileMimeType, fileName: doc.fileName };
  }

  // ----------------------------------------------------------------
  // Approve or reject a single uploaded document.
  // BR-O06: rejection must have a reason.
  // ----------------------------------------------------------------
  async decideDocument(
    customerId: string,
    documentId: string,
    dto: KycDecisionDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<DocumentResponseDto> {
    if (dto.decision === KycDecision.REJECT && !dto.reason) {
      throw new BusinessRuleException(
        'KYC_REJECTION_REASON_REQUIRED',
        'A reason must be provided when rejecting a KYC document',
      );
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.customerId !== customerId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    const status =
      dto.decision === KycDecision.APPROVE
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    const updated = await this.documentRepo.updateStatus(
      doc.id,
      status,
      actorId,
      dto.decision === KycDecision.REJECT ? dto.reason : undefined,
    );

    await this.audit.log({
      actorId,
      action:
        dto.decision === KycDecision.APPROVE ? 'KYC_DOCUMENT_APPROVED' : 'KYC_DOCUMENT_REJECTED',
      entityType: 'CustomerDocument',
      entityId: doc.id,
      before: { status: doc.status },
      after: {
        status,
        documentType: doc.documentType,
        customerId,
        reason: dto.reason ?? null,
      },
      reason: dto.reason,
      ipAddress,
    });

    return DocumentResponseDto.fromEntity(updated);
  }

  // ----------------------------------------------------------------
  // Start KYC review — creates KYCVerification and moves customer to UNDER_REVIEW
  // ----------------------------------------------------------------
  async startReview(
    customerId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<KycVerificationResponseDto> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    // Check no active review already exists
    const existing = await this.kycRepo.findLatestByCustomerId(customerId);
    if (
      existing &&
      (existing.status === VerificationStatus.PENDING ||
        existing.status === VerificationStatus.UNDER_REVIEW)
    ) {
      throw new BusinessRuleException(
        'KYC_REVIEW_ALREADY_ACTIVE',
        'A KYC review is already in progress for this customer',
      );
    }

    // Create KYCVerification record
    const verification = await this.kycRepo.create(customerId);

    // Transition customer to UNDER_REVIEW via CustomersService
    await this.customersService.markUnderReview(customerId, actorId);

    // Update verification to UNDER_REVIEW
    const updated = await this.kycRepo.updateStatus(
      verification.id,
      VerificationStatus.UNDER_REVIEW,
      actorId,
    );

    await this.audit.log({
      actorId,
      action: 'KYC_REVIEW_STARTED',
      entityType: 'KYCVerification',
      entityId: verification.id,
      after: { customerId, status: 'UNDER_REVIEW', reviewerId: actorId },
      ipAddress,
    });

    return KycVerificationResponseDto.fromEntity(updated);
  }

  // ----------------------------------------------------------------
  // UC-03: Make KYC decision (APPROVE or REJECT)
  // BR-O06: rejection must have a reason
  // ----------------------------------------------------------------
  async makeDecision(
    customerId: string,
    dto: KycDecisionDto,
    actorId: string,
    ipAddress?: string,
  ): Promise<KycVerificationResponseDto> {
    // Validate: rejection MUST have a reason (BR-O06 principle)
    if (dto.decision === KycDecision.REJECT && !dto.reason) {
      throw new BusinessRuleException(
        'KYC_REJECTION_REASON_REQUIRED',
        'A reason must be provided when rejecting a KYC application',
      );
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const verification = await this.kycRepo.findLatestByCustomerId(customerId);
    if (!verification || !verification.canDecide()) {
      throw new BusinessRuleException(
        'KYC_NO_ACTIVE_REVIEW',
        'No active KYC review found for this customer. Start a review first.',
      );
    }

    if (dto.decision === KycDecision.APPROVE) {
      const updated = await this.kycRepo.updateStatus(
        verification.id,
        VerificationStatus.APPROVED,
        actorId,
      );

      // Approve customer via CustomersService (also creates CustomerAccount)
      await this.customersService.approve(customerId, actorId, ipAddress);

      await this.audit.log({
        actorId,
        action: 'KYC_APPROVED',
        entityType: 'KYCVerification',
        entityId: verification.id,
        before: { status: 'UNDER_REVIEW' },
        after: { status: 'APPROVED', reviewerId: actorId },
        ipAddress,
      });

      // Notify customer — docs/16: "KYC approved"
      // Non-blocking: notification failure must not affect KYC decision
      const customer = await this.customerRepo.findById(customerId).catch(() => null);
      this.notificationService
        .dispatch({
          recipientId: customer?.userId ?? null,
          recipientMobile: customer?.mobile ?? null,
          type: NotificationType.KYC_APPROVED,
          subject: 'احراز هویت تأیید شد',
          body: 'اطلاعات هویتی شما با موفقیت تأیید شد. اکنون می‌توانید سفارش ثبت کنید.',
          relatedEntityType: 'KYCVerification',
          relatedEntityId: verification.id,
        })
        .catch((err: unknown) =>
          this.logger.error(`[KycService] KYC_APPROVED notification failed: ${err}`),
        );

      return KycVerificationResponseDto.fromEntity(updated);
    } else {
      const updated = await this.kycRepo.updateStatus(
        verification.id,
        VerificationStatus.REJECTED,
        actorId,
        dto.reason,
      );

      // Reject customer via CustomersService
      await this.customersService.reject(customerId, dto.reason!, actorId, ipAddress);

      await this.audit.log({
        actorId,
        action: 'KYC_REJECTED',
        entityType: 'KYCVerification',
        entityId: verification.id,
        before: { status: 'UNDER_REVIEW' },
        after: { status: 'REJECTED', reviewerId: actorId, reason: dto.reason },
        reason: dto.reason,
        ipAddress,
      });

      // Notify customer — docs/16: "KYC rejected"
      const customerForNotif = await this.customerRepo.findById(customerId).catch(() => null);
      this.notificationService
        .dispatch({
          recipientId: customerForNotif?.userId ?? null,
          recipientMobile: customerForNotif?.mobile ?? null,
          type: NotificationType.KYC_REJECTED,
          subject: 'احراز هویت رد شد',
          body: `اطلاعات هویتی شما تأیید نشد.${dto.reason ? ` دلیل: ${dto.reason}` : ''} لطفاً با پشتیبانی تماس بگیرید.`,
          relatedEntityType: 'KYCVerification',
          relatedEntityId: verification.id,
        })
        .catch((err: unknown) =>
          this.logger.error(`[KycService] KYC_REJECTED notification failed: ${err}`),
        );

      return KycVerificationResponseDto.fromEntity(updated);
    }
  }

  // ----------------------------------------------------------------
  // Customer portal: own overview. No file keys, signed URLs, or reviewer ids.
  // ----------------------------------------------------------------
  async getOwnOverview(userId: string): Promise<OwnKycView> {
    const customer = await this.customerRepo.findByUserId(userId);
    if (!customer) {
      throw new NotFoundException('No customer profile found for this user account');
    }

    const [documents, verifications] = await Promise.all([
      this.documentRepo.findByCustomerId(customer.id),
      this.kycRepo.findAllByCustomerId(customer.id),
    ]);

    return buildOwnKycView({
      customer: {
        status: customer.status,
        type: customer.type,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nationalId: customer.nationalId,
        rejectionReason: customer.rejectionReason,
        createdAt: customer.createdAt,
      },
      documents: documents.map((document): WorkflowDocument => ({
        id: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        fileMimeType: document.fileMimeType,
        fileSizeBytes: document.fileSizeBytes,
        status: document.status,
        rejectionReason: document.rejectionReason,
        createdAt: document.createdAt,
        reviewedAt: document.reviewedAt,
      })),
      verifications: verifications.map((verification): WorkflowVerification => ({
        id: verification.id,
        status: verification.status,
        decisionReason: verification.decisionReason,
        reviewedAt: verification.reviewedAt,
        createdAt: verification.createdAt,
        updatedAt: verification.updatedAt,
      })),
    });
  }

  // ----------------------------------------------------------------
  // Customer portal upload. Ownership comes from the token, then the
  // existing private-bucket submit path stores the file.
  // ----------------------------------------------------------------
  async submitOwnDocument(params: {
    userId: string;
    documentType: string;
    file: Express.Multer.File;
    ipAddress?: string;
  }): Promise<DocumentResponseDto> {
    const customer = await this.customerRepo.findByUserId(params.userId);
    if (!customer) {
      throw new NotFoundException('No customer profile found for this user account');
    }

    const [documents, latestVerification] = await Promise.all([
      this.documentRepo.findByCustomerId(customer.id),
      this.kycRepo.findLatestByCustomerId(customer.id),
    ]);
    const overview = buildOwnKycView({
      customer: {
        status: customer.status,
        type: customer.type,
        firstName: customer.firstName,
        lastName: customer.lastName,
        nationalId: customer.nationalId,
        rejectionReason: customer.rejectionReason,
        createdAt: customer.createdAt,
      },
      documents: documents.map((document) => ({
        id: document.id,
        documentType: document.documentType,
        fileName: document.fileName,
        fileMimeType: document.fileMimeType,
        fileSizeBytes: document.fileSizeBytes,
        status: document.status,
        rejectionReason: document.rejectionReason,
        createdAt: document.createdAt,
        reviewedAt: document.reviewedAt,
      })),
      verifications: latestVerification
        ? [
            {
              id: latestVerification.id,
              status: latestVerification.status,
              decisionReason: latestVerification.decisionReason,
              reviewedAt: latestVerification.reviewedAt,
              createdAt: latestVerification.createdAt,
              updatedAt: latestVerification.updatedAt,
            },
          ]
        : [],
    });
    const current = overview.documents.find((item) => item.type === params.documentType);
    const reason = uploadBlockReason({
      phase: overview.phase,
      documentType: params.documentType,
      status: current?.file?.status ?? null,
      allowedTypes: requiredKycTypes(customer.type).map((item) => item.type),
    });
    if (reason) {
      throw new BusinessRuleException('KYC_UPLOAD_NOT_ALLOWED', reason);
    }

    return this.submitDocument({
      customerId: customer.id,
      documentType: params.documentType,
      file: params.file,
      actorId: params.userId,
      ipAddress: params.ipAddress,
    });
  }

  /**
   * Withdraw one of the customer's own documents before review starts.
   * Approved and in-review files stay in place. Rejected files are replaced
   * by a new upload instead of being deleted.
   */
  async deleteOwnDocument(params: {
    userId: string;
    documentId: string;
    ipAddress?: string;
  }): Promise<void> {
    const customer = await this.customerRepo.findByUserId(params.userId);
    if (!customer) {
      throw new NotFoundException('No customer profile found for this user account');
    }

    const document = await this.documentRepo.findById(params.documentId);
    if (!document || document.customerId !== customer.id) {
      throw new NotFoundException('مدرک پیدا نشد.');
    }

    const overview = await this.getOwnOverview(params.userId);
    const current = overview.documents.find((item) => item.file?.id === document.id);
    const reason = deleteBlockReason({
      phase: overview.phase,
      status: current?.file?.status ?? null,
    });
    if (reason) {
      throw new BusinessRuleException('KYC_DELETE_NOT_ALLOWED', reason);
    }

    await this.storage.delete(document.fileKey, this.storage.kycBucket);
    await this.documentRepo.deleteById(document.id);

    await this.audit.log({
      actorId: params.userId,
      action: 'KYC_DOCUMENT_WITHDRAWN',
      entityType: 'CustomerDocument',
      entityId: document.id,
      after: {
        customerId: customer.id,
        documentType: document.documentType,
      },
      ipAddress: params.ipAddress,
    });
  }

  async readOwnDocumentFile(
    userId: string,
    documentId: string,
    ipAddress?: string,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const customer = await this.findCustomerByUserId(userId);
    return this.readDocumentFile(customer.id, documentId, userId, ipAddress);
  }

  // ----------------------------------------------------------------
  // Utility: find customer entity by userId (for /me endpoints)
  // ----------------------------------------------------------------
  async findCustomerByUserId(userId: string): Promise<{ id: string }> {
    const customer = await this.customerRepo.findByUserId(userId);
    if (!customer) {
      throw new NotFoundException('No customer profile found for this user account');
    }
    return { id: customer.id };
  }

  // ----------------------------------------------------------------
  // Get KYC verification history for a customer
  // ----------------------------------------------------------------
  async getVerificationHistory(
    customerId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<KycVerificationResponseDto[]> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const verifications = await this.kycRepo.findAllByCustomerId(customerId);

    await this.audit.log({
      actorId,
      action: 'KYC_HISTORY_ACCESSED',
      entityType: 'Customer',
      entityId: customerId,
      ipAddress,
    });

    return verifications.map(KycVerificationResponseDto.fromEntity);
  }
}
