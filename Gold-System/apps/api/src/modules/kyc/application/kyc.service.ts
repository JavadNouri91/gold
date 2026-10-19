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
import { toLatinDigits } from '../../../common/digits';
import { KYCVerificationEntity } from '../domain/entities/kyc-verification.entity';
import { CustomerDocumentEntity } from '../domain/entities/customer-document.entity';
import { KycDecisionDto, KycDecision } from './dto/kyc-decision.dto';
import { CustomerStatus, CustomerType, VerificationStatus } from '@gold/shared-types';
import {
  buildOwnKycView,
  deleteBlockReason,
  kycStaffBucket,
  requiredKycTypes,
  uploadBlockReason,
  type KycStaffBucket,
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
  hasOriginalFile: boolean;
  hasProcessedFile: boolean;
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
    dto.hasOriginalFile = Boolean(entity.originalFileKey);
    dto.hasProcessedFile = Boolean(entity.processedFileKey);
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

export type KycQueueDisplay = KycStaffBucket | 'rejected';

function resolveKycDisplay(
  bucket: KycStaffBucket,
  verificationStatus: VerificationStatus | null,
): KycQueueDisplay {
  if (bucket === 'verified' || bucket === 'awaiting') return bucket;
  if (verificationStatus === VerificationStatus.REJECTED) return 'rejected';
  return 'unverified';
}

export interface KycReviewQueueItem {
  id: string;
  customerNumber: string;
  fullName: string;
  mobile: string;
  nationalId: string;
  status: CustomerStatus;
  customerType: string | null;
  bucket: KycStaffBucket;
  kycDisplay: KycQueueDisplay;
  verificationStatus: VerificationStatus | null;
  pendingDocuments: number;
  viewedDocuments: number;
  latestSubmittedAt: string;
}

export interface KycReviewQueueSummary {
  verified: number;
  unverified: number;
  awaiting: number;
}

export interface KycReviewQueue {
  items: KycReviewQueueItem[];
  summary: KycReviewQueueSummary;
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const EDITABLE_KYC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PERSONAL_PHOTO_TYPE = 'personal_photo';

function mimeFromStoredKey(key: string, fallback: string): string {
  const extension = key.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return fallback;
}

function latestDocumentStatusByType(
  documents: CustomerDocumentEntity[],
): Map<string, VerificationStatus> {
  const latest = new Map<string, VerificationStatus>();
  const ordered = [...documents].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const document of ordered) {
    if (!latest.has(document.documentType)) {
      latest.set(document.documentType, document.status);
    }
  }
  return latest;
}

const PRESERVED_REVIEW_CUSTOMER_STATUSES = new Set<CustomerStatus>([
  CustomerStatus.APPROVED,
  CustomerStatus.ACTIVE,
  CustomerStatus.SUSPENDED,
  CustomerStatus.BLOCKED,
]);

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

  async getReviewQueue(
    params: {
      page?: number;
      limit?: number;
      /** When set, only that staff bucket. When omitted, return the mixed queue. */
      bucket?: KycStaffBucket;
      /** KYC display filter: verified | awaiting | unverified | rejected */
      kycDisplay?: KycQueueDisplay;
      customerStatus?: CustomerStatus;
      customerType?: CustomerType;
      status?: VerificationStatus.PENDING | VerificationStatus.UNDER_REVIEW;
      search?: string;
    },
    actorId: string,
    ipAddress?: string,
  ): Promise<KycReviewQueue> {
    const page = Number.isFinite(params.page) ? Math.max(1, params.page ?? 1) : 1;
    const limit = Number.isFinite(params.limit)
      ? Math.min(100, Math.max(1, params.limit ?? 20))
      : 20;
    const [customers, latestDocuments, latestVerifications] = await Promise.all([
      this.customerRepo.findAll(),
      this.documentRepo.findLatestPerCustomerAndType(),
      this.kycRepo.findLatestPerCustomer(),
    ]);

    const latestByCustomer = new Map<string, CustomerDocumentEntity[]>();
    for (const document of latestDocuments) {
      const current = latestByCustomer.get(document.customerId) ?? [];
      current.push(document);
      latestByCustomer.set(document.customerId, current);
    }
    const verificationByCustomer = new Map(
      latestVerifications.map((verification) => [verification.customerId, verification.status]),
    );

    const summary: KycReviewQueueSummary = { verified: 0, unverified: 0, awaiting: 0 };
    const search = toLatinDigits(params.search?.trim() ?? '').toLocaleLowerCase('fa-IR');
    const rows = customers.flatMap<KycReviewQueueItem>((customer) => {
      const required = requiredKycTypes(customer.type);
      const requiredTypes = required.map((item) => item.type);
      const latest = latestDocumentStatusByType(latestByCustomer.get(customer.id) ?? []);
      const verificationStatus = verificationByCustomer.get(customer.id) ?? null;
      const customerBucket = kycStaffBucket({
        verificationStatus,
        requiredTypes,
        latestStatusByType: latest,
      });
      summary[customerBucket] += 1;

      const awaiting = (latestByCustomer.get(customer.id) ?? []).filter(
        (document) =>
          requiredTypes.includes(document.documentType) &&
          (document.status === VerificationStatus.PENDING ||
            document.status === VerificationStatus.UNDER_REVIEW),
      );
      const kycDisplay = resolveKycDisplay(customerBucket, verificationStatus);

      if (params.bucket && customerBucket !== params.bucket) return [];
      if (params.kycDisplay && kycDisplay !== params.kycDisplay) return [];
      if (params.customerStatus && customer.status !== params.customerStatus) return [];
      if (params.customerType && customer.type !== params.customerType) return [];
      if (params.status && !awaiting.some((document) => document.status === params.status)) {
        return [];
      }
      const searchable = toLatinDigits(
        `${customer.fullName} ${customer.mobile} ${customer.customerNumber} ${customer.nationalId}`,
      ).toLocaleLowerCase('fa-IR');
      if (search && !searchable.includes(search)) return [];

      const dated = latestByCustomer.get(customer.id) ?? [];
      const latestSubmittedAt = dated.reduce(
        (latestDate, document) =>
          document.createdAt > latestDate ? document.createdAt : latestDate,
        dated[0]?.createdAt ?? customer.createdAt,
      );
      return [
        {
          id: customer.id,
          customerNumber: customer.customerNumber,
          fullName: customer.fullName,
          mobile: customer.mobile,
          nationalId: customer.nationalId,
          status: customer.status,
          customerType: customer.type,
          bucket: customerBucket,
          kycDisplay,
          verificationStatus,
          pendingDocuments: awaiting.filter(
            (document) => document.status === VerificationStatus.PENDING,
          ).length,
          viewedDocuments: awaiting.filter(
            (document) => document.status === VerificationStatus.UNDER_REVIEW,
          ).length,
          latestSubmittedAt: latestSubmittedAt.toISOString(),
        },
      ];
    });
    rows.sort(
      (a, b) => new Date(b.latestSubmittedAt).getTime() - new Date(a.latestSubmittedAt).getTime(),
    );

    const total = rows.length;
    const items = rows.slice((page - 1) * limit, page * limit);
    await this.audit.log({
      actorId,
      action: 'KYC_REVIEW_QUEUE_ACCESSED',
      entityType: 'KYCReviewQueue',
      entityId: 'queue',
      after: {
        page,
        limit,
        total,
        bucket: params.bucket ?? null,
        kycDisplay: params.kycDisplay ?? null,
        customerStatus: params.customerStatus ?? null,
        customerType: params.customerType ?? null,
        status: params.status ?? null,
        summary,
      },
      ipAddress,
    });

    return {
      items,
      summary,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
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
    markAsViewed = true,
    original = false,
    processed = false,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.customerId !== customerId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    if (processed) {
      if (!doc.processedFileKey) {
        throw new NotFoundException('تصویر بدون پس‌زمینه برای این مدرک ذخیره نشده است.');
      }
      const buffer = await this.storage.getObject(doc.processedFileKey, this.storage.kycBucket);
      await this.audit.log({
        actorId,
        action: 'KYC_DOCUMENT_PROCESSED_VIEWED',
        entityType: 'CustomerDocument',
        entityId: doc.id,
        after: { documentType: doc.documentType, customerId, processed: true },
        ipAddress,
      });
      return {
        buffer,
        mimeType: 'image/png',
        fileName: `processed-${doc.fileName.replace(/\.[^.]+$/, '')}.png`,
      };
    }

    const useOriginal = Boolean(original && doc.originalFileKey);
    const fileKey = useOriginal ? doc.originalFileKey! : doc.fileKey;
    const buffer = await this.storage.getObject(fileKey, this.storage.kycBucket);
    const shouldMarkViewed = markAsViewed && !useOriginal && doc.status === VerificationStatus.PENDING;
    if (shouldMarkViewed) {
      await this.documentRepo.updateStatus(doc.id, VerificationStatus.UNDER_REVIEW, actorId);
    }

    await this.audit.log({
      actorId,
      action: useOriginal ? 'KYC_DOCUMENT_ORIGINAL_VIEWED' : 'KYC_DOCUMENT_VIEWED',
      entityType: 'CustomerDocument',
      entityId: doc.id,
      before: { status: doc.status },
      after: {
        documentType: doc.documentType,
        customerId,
        original: useOriginal,
        status: shouldMarkViewed ? VerificationStatus.UNDER_REVIEW : doc.status,
      },
      ipAddress,
    });

    return {
      buffer,
      mimeType: useOriginal ? mimeFromStoredKey(fileKey, doc.fileMimeType) : doc.fileMimeType,
      fileName: useOriginal ? `original-${doc.fileName}` : doc.fileName,
    };
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
    const reason = dto.reason?.trim();
    if (dto.decision === KycDecision.REJECT && (!reason || reason.length < 10)) {
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

    if (dto.decision === KycDecision.APPROVE && doc.status === VerificationStatus.APPROVED) {
      throw new BusinessRuleException(
        'KYC_DOCUMENT_ALREADY_APPROVED',
        'This document has already been approved',
      );
    }

    const status =
      dto.decision === KycDecision.APPROVE
        ? VerificationStatus.APPROVED
        : VerificationStatus.REJECTED;

    const updated = await this.documentRepo.updateStatus(
      doc.id,
      status,
      actorId,
      dto.decision === KycDecision.REJECT ? reason : undefined,
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
        reason: reason ?? null,
      },
      reason,
      ipAddress,
    });

    if (dto.decision === KycDecision.APPROVE) {
      await this.verifyCustomerIfDocumentsComplete(customer, actorId, ipAddress);
    }

    return DocumentResponseDto.fromEntity(updated);
  }

  private allRequiredDocumentsApproved(
    customerType: string | null | undefined,
    documents: CustomerDocumentEntity[],
  ): boolean {
    const latest = latestDocumentStatusByType(documents);
    const required = requiredKycTypes(customerType);
    return (
      required.length > 0 &&
      required.every((requirement) => latest.get(requirement.type) === VerificationStatus.APPROVED)
    );
  }

  /** When every required document is approved, persist the KYC case as verified. */
  private async verifyCustomerIfDocumentsComplete(
    customer: { id: string; type: string | null; status: CustomerStatus },
    actorId: string,
    ipAddress?: string,
  ): Promise<KYCVerificationEntity | null> {
    const documents = await this.documentRepo.findByCustomerId(customer.id);
    if (!this.allRequiredDocumentsApproved(customer.type, documents)) return null;

    let verification = await this.kycRepo.findLatestByCustomerId(customer.id);
    if (verification?.status === VerificationStatus.APPROVED) {
      if (!PRESERVED_REVIEW_CUSTOMER_STATUSES.has(customer.status)) {
        await this.customersService.approve(customer.id, actorId, ipAddress);
      }
      return verification;
    }

    if (!verification || verification.status === VerificationStatus.REJECTED) {
      verification = await this.kycRepo.create(customer.id);
    }

    const previousStatus = verification.status;
    const updated = await this.kycRepo.updateStatus(
      verification.id,
      VerificationStatus.APPROVED,
      actorId,
    );

    if (!PRESERVED_REVIEW_CUSTOMER_STATUSES.has(customer.status)) {
      await this.customersService.approve(customer.id, actorId, ipAddress);
    }

    await this.audit.log({
      actorId,
      action: 'KYC_APPROVED',
      entityType: 'KYCVerification',
      entityId: verification.id,
      before: { status: previousStatus },
      after: { status: 'APPROVED', reviewerId: actorId, source: 'all_documents_approved' },
      ipAddress,
    });

    const customerForNotif = await this.customerRepo.findById(customer.id).catch(() => null);
    this.notificationService
      .dispatch({
        recipientId: customerForNotif?.userId ?? null,
        recipientMobile: customerForNotif?.mobile ?? null,
        type: NotificationType.KYC_APPROVED,
        subject: 'احراز هویت تأیید شد',
        body: 'اطلاعات هویتی شما با موفقیت تأیید شد. اکنون می‌توانید سفارش ثبت کنید.',
        relatedEntityType: 'KYCVerification',
        relatedEntityId: verification.id,
      })
      .catch((err: unknown) =>
        this.logger.error(`[KycService] KYC_APPROVED notification failed: ${err}`),
      );

    return updated;
  }

  // ----------------------------------------------------------------
  // Staff crop/rotate of the current KYC image. The first uploaded object
  // is kept as originalFileKey for audit; later edits replace fileKey only.
  // ----------------------------------------------------------------
  async replaceStaffDocumentImage(
    customerId: string,
    documentId: string,
    file: Express.Multer.File,
    actorId: string,
    ipAddress?: string,
  ): Promise<DocumentResponseDto> {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    if (file.size > MAX_KYC_FILE_SIZE_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است.');
    }
    if (!EDITABLE_KYC_IMAGE_TYPES.has(file.mimetype)) {
      throw new BadRequestException('فقط تصویر JPEG، PNG یا WebP قابل ویرایش است.');
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.customerId !== customerId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    if (!doc.fileMimeType.startsWith('image/')) {
      throw new BadRequestException('این مدرک تصویر نیست و قابل ویرایش نیست.');
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      prefix: `kyc-documents/${customerId}`,
      bucket: this.storage.kycBucket,
    });

    const originalFileKey = doc.originalFileKey ?? doc.fileKey;
    const previousKey = doc.fileKey;
    const previousProcessed = doc.processedFileKey;
    const updated = await this.documentRepo.replaceFile(doc.id, {
      fileKey: stored.key,
      originalFileKey,
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      fileSizeBytes: file.size,
      processedFileKey: null,
    });

    if (previousKey !== originalFileKey && previousKey !== stored.key) {
      try {
        await this.storage.delete(previousKey, this.storage.kycBucket);
      } catch (err) {
        this.logger.warn(`Could not delete superseded KYC edit ${previousKey}`, err);
      }
    }
    if (previousProcessed) {
      try {
        await this.storage.delete(previousProcessed, this.storage.kycBucket);
      } catch (err) {
        this.logger.warn(`Could not delete stale processed KYC photo ${previousProcessed}`, err);
      }
    }

    await this.audit.log({
      actorId,
      action: 'KYC_DOCUMENT_IMAGE_EDITED',
      entityType: 'CustomerDocument',
      entityId: doc.id,
      before: { fileKey: previousKey, originalFileKey: doc.originalFileKey },
      after: {
        fileKey: stored.key,
        originalFileKey,
        customerId,
        documentType: doc.documentType,
      },
      ipAddress,
    });

    return DocumentResponseDto.fromEntity(updated);
  }

  async saveProcessedPersonalPhoto(
    customerId: string,
    documentId: string,
    file: Express.Multer.File,
    actorId: string,
    ipAddress?: string,
  ): Promise<DocumentResponseDto> {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    if (file.size > MAX_KYC_FILE_SIZE_BYTES) {
      throw new BadRequestException('حجم فایل بیش از حد مجاز است.');
    }
    if (file.mimetype !== 'image/png') {
      throw new BadRequestException('عکس بدون پس‌زمینه باید PNG باشد.');
    }

    const customer = await this.customerRepo.findById(customerId);
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }
    const doc = await this.documentRepo.findById(documentId);
    if (!doc || doc.customerId !== customerId) {
      throw new NotFoundException(`Document ${documentId} not found`);
    }
    if (doc.documentType !== PERSONAL_PHOTO_TYPE) {
      throw new BadRequestException('حذف پس‌زمینه فقط برای عکس پرسنلی مجاز است.');
    }
    if (!doc.fileMimeType.startsWith('image/')) {
      throw new BadRequestException('این مدرک تصویر نیست.');
    }

    const stored = await this.storage.upload({
      buffer: file.buffer,
      originalName: file.originalname || 'personal-photo-cutout.png',
      mimeType: 'image/png',
      sizeBytes: file.size,
      prefix: `kyc-documents/${customerId}/processed`,
      bucket: this.storage.kycBucket,
    });

    const previousProcessed = doc.processedFileKey;
    const updated = await this.documentRepo.updateProcessedFile(doc.id, stored.key);
    if (previousProcessed && previousProcessed !== stored.key) {
      try {
        await this.storage.delete(previousProcessed, this.storage.kycBucket);
      } catch (err) {
        this.logger.warn(`Could not delete previous processed KYC photo ${previousProcessed}`, err);
      }
    }

    await this.audit.log({
      actorId,
      action: 'KYC_PERSONAL_PHOTO_PROCESSED',
      entityType: 'CustomerDocument',
      entityId: doc.id,
      before: { processedFileKey: previousProcessed, fileKey: doc.fileKey },
      after: {
        processedFileKey: stored.key,
        fileKey: doc.fileKey,
        originalFileKey: doc.originalFileKey ?? doc.fileKey,
        customerId,
        documentType: doc.documentType,
      },
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

    const documents = await this.documentRepo.findByCustomerId(customerId);
    const latestStatuses = latestDocumentStatusByType(documents);
    const incomplete = requiredKycTypes(customer.type).filter((requirement) => {
      const status = latestStatuses.get(requirement.type);
      return !status || status === VerificationStatus.REJECTED;
    });
    if (incomplete.length > 0) {
      throw new BusinessRuleException(
        'KYC_DOCUMENTS_INCOMPLETE',
        'همه مدارک الزامی باید پیش از شروع بررسی ارسال شوند.',
      );
    }

    // Create KYCVerification record
    const verification = await this.kycRepo.create(customerId);

    // Legacy customers may already have an active account. Their account
    // status is preserved while a new KYC cycle reviews newly-required docs.
    if (!PRESERVED_REVIEW_CUSTOMER_STATUSES.has(customer.status)) {
      await this.customersService.markUnderReview(customerId, actorId);
    }

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
      const documents = await this.documentRepo.findByCustomerId(customerId);
      if (!this.allRequiredDocumentsApproved(customer.type, documents)) {
        throw new BusinessRuleException(
          'KYC_DOCUMENTS_NOT_APPROVED',
          'تأیید نهایی فقط پس از تأیید همه مدارک الزامی ممکن است.',
        );
      }

      const updated = await this.verifyCustomerIfDocumentsComplete(customer, actorId, ipAddress);
      return KycVerificationResponseDto.fromEntity(updated ?? verification);
    } else {
      const updated = await this.kycRepo.updateStatus(
        verification.id,
        VerificationStatus.REJECTED,
        actorId,
        dto.reason,
      );

      // Preserve an existing account state during legacy re-verification.
      // The KYC verification itself remains rejected and visible to the user.
      if (!PRESERVED_REVIEW_CUSTOMER_STATUSES.has(customer.status)) {
        await this.customersService.reject(customerId, dto.reason!, actorId, ipAddress);
      }

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
        hasProcessedFile: Boolean(document.processedFileKey),
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
        hasProcessedFile: Boolean(document.processedFileKey),
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
    processed = false,
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    const customer = await this.findCustomerByUserId(userId);
    return this.readDocumentFile(customer.id, documentId, userId, ipAddress, false, false, processed);
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
