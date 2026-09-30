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
import { KycService } from '../../application/kyc.service';
import { KycDecisionDto } from '../../application/dto/kyc-decision.dto';
import { SubmitDocumentDto } from '../../application/dto/submit-document.dto';

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
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const file = await this.kyc.readOwnDocumentFile(
      requireActorId(user),
      documentId,
      req.ip ?? undefined,
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: 'inline; filename="document"',
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

  @Get(':customerId/documents/:documentId/file')
  @RequirePermissions('kyc.documents.read')
  @ApiOperation({ summary: 'Read a customer KYC file (staff)' })
  async readDocumentFile(
    @CurrentUser() user: CurrentUserData,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Req() req: Request,
  ): Promise<StreamableFile> {
    const file = await this.kyc.readDocumentFile(
      customerId,
      documentId,
      requireActorId(user),
      req.ip ?? undefined,
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: 'inline; filename="document"',
    });
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
