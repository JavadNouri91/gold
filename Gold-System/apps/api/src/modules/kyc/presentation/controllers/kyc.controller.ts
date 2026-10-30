import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import {
  ALLOWED_KYC_MIME_TYPES,
  MAX_KYC_FILE_SIZE_BYTES,
} from '../../../../common/storage/storage.service';
import { inlineDisposition } from '../../../../common/storage/file-disposition';
import { KycService } from '../../application/kyc.service';
import { KycDecisionDto } from '../../application/dto/kyc-decision.dto';
import { SubmitDocumentDto } from '../../application/dto/submit-document.dto';
import { CustomerStatus, CustomerType, VerificationStatus } from '@gold/shared-types';
import type { KycStaffBucket } from '../../domain/kyc-workflow';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/**
 * Some mobile browsers send an empty or generic MIME type for camera photos.
 * Only fill that gap from the extension. A declared disallowed type stays disallowed.
 */
export function normalizeUploadedMime(file: Express.Multer.File): void {
  if ((ALLOWED_KYC_MIME_TYPES as readonly string[]).includes(file.mimetype)) return;
  if (file.mimetype && file.mimetype !== 'application/octet-stream') return;
  const extension = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  const mapped = MIME_BY_EXTENSION[extension];
  if (mapped) file.mimetype = mapped;
}

/**
 * KYC HTTP API.
 *
 * Customer routes are under `/customers/me` and resolve the owner from the
 * access token. A customer cannot pass another customer's id.
 * Staff routes keep the permission checks the dashboard already uses.
 *
 * `me` routes are declared before `:customerId` so they are not captured
 * as an id.
 */
@ApiTags('kyc')
@ApiBearerAuth()
@Controller('customers')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get('me/kyc')
  @ApiOperation({ summary: 'Own KYC overview: phase, required documents, and history' })
  getOwnOverview(@CurrentUser() user: CurrentUserData) {
    return this.kyc.getOwnOverview(requireActorId(user));
  }

  @Get('me/documents/:documentId/file')
  @ApiOperation({ summary: 'Read one of the authenticated customer’s KYC files' })
  async readOwnFile(
    @CurrentUser() user: CurrentUserData,
    @Param('documentId') documentId: string,
    @Query('processed') processed: string | undefined,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const file = await this.kyc.readOwnDocumentFile(
      requireActorId(user),
      documentId,
      req.ip ?? undefined,
      processed === 'true' || processed === '1',
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: inlineDisposition(file.fileName),
    });
  }

  @Post('me/documents')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one required KYC document for the authenticated customer' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_KYC_FILE_SIZE_BYTES },
    }),
  )
  submitOwnDocument(
    @CurrentUser() user: CurrentUserData,
    @Body() dto: SubmitDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    normalizeUploadedMime(file);
    return this.kyc.submitOwnDocument({
      userId: requireActorId(user),
      documentType: dto.documentType,
      file,
      ipAddress: req.ip ?? undefined,
    });
  }

  @Delete('me/documents/:documentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Withdraw one own KYC document before review starts' })
  deleteOwnDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ) {
    return this.kyc.deleteOwnDocument({
      userId: requireActorId(user),
      documentId,
      ipAddress: req.ip ?? undefined,
    });
  }

  @Get('kyc/pending-count')
  @RequirePermissions('kyc.review', 'customer.read')
  @ApiOperation({ summary: 'Count customers waiting for KYC document review (sidebar badge)' })
  getPendingReviewCount() {
    return this.kyc.getPendingReviewCount();
  }

  @Get('kyc/queue')
  @RequirePermissions('kyc.review', 'customer.read')
  @ApiOperation({ summary: 'Staff KYC queue with optional bucket / display / type filters' })
  getReviewQueue(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('bucket') bucket: string | undefined,
    @Query('kycDisplay') kycDisplay: string | undefined,
    @Query('customerStatus') customerStatus: string | undefined,
    @Query('customerType') customerType: string | undefined,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Req() req: Request,
  ) {
    const documentStatus =
      status === VerificationStatus.PENDING || status === VerificationStatus.UNDER_REVIEW
        ? status
        : undefined;
    const staffBucket: KycStaffBucket | undefined =
      bucket === 'verified' || bucket === 'unverified' || bucket === 'awaiting'
        ? bucket
        : undefined;
    const display =
      kycDisplay === 'verified' ||
      kycDisplay === 'unverified' ||
      kycDisplay === 'awaiting' ||
      kycDisplay === 'rejected'
        ? kycDisplay
        : undefined;
    const statusFilter = Object.values(CustomerStatus).includes(customerStatus as CustomerStatus)
      ? (customerStatus as CustomerStatus)
      : undefined;
    const typeFilter = Object.values(CustomerType).includes(customerType as CustomerType)
      ? (customerType as CustomerType)
      : undefined;
    return this.kyc.getReviewQueue(
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        bucket: staffBucket,
        kycDisplay: display,
        customerStatus: statusFilter,
        customerType: typeFilter,
        status: documentStatus,
        search,
      },
      requireActorId(user),
      req.ip ?? undefined,
    );
  }

  @Post(':customerId/documents')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a KYC document on behalf of a customer (staff)' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_KYC_FILE_SIZE_BYTES },
    }),
  )
  submitStaffDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Body() dto: SubmitDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    normalizeUploadedMime(file);
    return this.kyc.submitStaffDocument({
      customerId,
      documentType: dto.documentType,
      file,
      actorId: requireActorId(user),
      ipAddress: req.ip ?? undefined,
    });
  }

  @Get(':customerId/documents')
  @RequirePermissions('kyc.documents.read')
  @ApiOperation({ summary: 'List a customer’s KYC documents (staff)' })
  getDocuments(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Query('withUrls') withUrls: string | undefined,
    @Req() req: Request,
  ) {
    return this.kyc.getDocuments(
      customerId,
      requireActorId(user),
      withUrls === 'true' || withUrls === '1',
      req.ip ?? undefined,
    );
  }

  @Delete(':customerId/documents/:documentId')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a customer KYC document (staff), including approved files' })
  deleteStaffDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ) {
    return this.kyc.deleteStaffDocument({
      customerId,
      documentId,
      actorId: requireActorId(user),
      ipAddress: req.ip ?? undefined,
    });
  }

  @Get(':customerId/documents/:documentId/file')
  @RequirePermissions('kyc.documents.read')
  @ApiOperation({ summary: 'Read a customer KYC file (staff)' })
  async readDocumentFile(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Query('original') original: string | undefined,
    @Query('processed') processed: string | undefined,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const file = await this.kyc.readDocumentFile(
      customerId,
      documentId,
      requireActorId(user),
      req.ip ?? undefined,
      true,
      original === 'true' || original === '1',
      processed === 'true' || processed === '1',
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: inlineDisposition(file.fileName),
    });
  }

  @Post(':customerId/documents/:documentId/file')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Replace a KYC document image after staff crop/rotate (keeps the original)',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_KYC_FILE_SIZE_BYTES },
    }),
  )
  replaceDocumentImage(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    normalizeUploadedMime(file);
    return this.kyc.replaceStaffDocumentImage(
      customerId,
      documentId,
      file,
      requireActorId(user),
      req.ip ?? undefined,
    );
  }

  @Post(':customerId/documents/:documentId/processed-file')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Save a background-free personal photo without replacing the review original',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_KYC_FILE_SIZE_BYTES },
    }),
  )
  saveProcessedPersonalPhoto(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!file || file.size <= 0) {
      throw new BadRequestException('فایل انتخاب نشده است.');
    }
    normalizeUploadedMime(file);
    return this.kyc.saveProcessedPersonalPhoto(
      customerId,
      documentId,
      file,
      requireActorId(user),
      req.ip ?? undefined,
    );
  }

  @Post(':customerId/documents/:documentId/reopen')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen an approved KYC document for review (staff)' })
  reopenDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ) {
    return this.kyc.reopenDocument(
      customerId,
      documentId,
      requireActorId(user),
      req.ip ?? undefined,
    );
  }

  @Post(':customerId/documents/:documentId/decision')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject one KYC document (staff)' })
  decideDocument(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Body() dto: KycDecisionDto,
    @Req() req: Request,
  ) {
    return this.kyc.decideDocument(
      customerId,
      documentId,
      dto,
      requireActorId(user),
      req.ip ?? undefined,
    );
  }

  @Post(':customerId/kyc/review')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start KYC review (staff)' })
  startReview(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Req() req: Request,
  ) {
    return this.kyc.startReview(customerId, requireActorId(user), req.ip ?? undefined);
  }

  @Post(':customerId/kyc/decision')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve or reject the KYC case (staff)' })
  decide(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Body() dto: KycDecisionDto,
    @Req() req: Request,
  ) {
    return this.kyc.makeDecision(customerId, dto, requireActorId(user), req.ip ?? undefined);
  }

  @Post(':customerId/kyc/activate')
  @RequirePermissions('kyc.review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a customer account after all required documents are approved',
  })
  activateCustomer(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Req() req: Request,
  ) {
    return this.kyc.activateCustomer(customerId, requireActorId(user), req.ip ?? undefined);
  }

  @Get(':customerId/kyc/history')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'KYC verification history (staff)' })
  history(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Req() req: Request,
  ) {
    return this.kyc.getVerificationHistory(customerId, requireActorId(user), req.ip ?? undefined);
  }
}
