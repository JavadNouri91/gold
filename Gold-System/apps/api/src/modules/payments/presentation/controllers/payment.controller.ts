import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import { PaymentService } from '../../application/payment.service';
import {
  RecordPaymentDto,
  AllocatePaymentDto,
  ValidatePaymentDto,
} from '../../application/dto/record-payment.dto';
import { PaymentMethod } from '../../domain/constants/payment-methods';
import { ListPaymentsQueryDto } from '../../application/dto/list-payments.query';
import { MAX_RECEIPT_BYTES } from '../../domain/receipt-file';

/**
 * Payment Controller
 *
 * REST endpoints for payment recording, validation, allocation, and listing.
 *
 * RBAC:
 *   payment.create — Accountant records a new payment
 *   payment.validate — Accountant validates a pending payment
 *   payment.allocate — Accountant allocates a validated payment to a Trade
 *   payment.read — Any authorized staff views payment details
 *
 * BR-S01: All permissions enforced at backend.
 * Customers may upload a receipt for their own confirmed trade. They cannot
 * allocate, validate, or settle.
 *
 * docs/21-business-decisions.md §9, §8
 * architecture/STATE-MACHINES.md (Payment state machine)
 */
@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payments
   * Record a new payment.
   * Accountant records receipt of cash/bank transfer/card-to-card from customer.
   */
  @Post()
  @RequirePermissions('payment.create')
  async recordPayment(
    @Body() dto: RecordPaymentDto,
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.paymentService.recordPayment(
      {
        idempotencyKey: dto.idempotencyKey,
        tradeId: dto.tradeId,
        method: dto.method as PaymentMethod,
        amount: dto.amount,
        referenceNumber: dto.referenceNumber,
        notes: dto.notes,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
      },
      requireActorId(req.user),
    );
  }

  /**
   * GET /payments
   * Staff (payment.read): any payments, including PENDING. customerId is a staff filter.
   * Customer (customer.payment.read_own): only the session customer's ledger.
   * Query customerId is ignored for customers.
   */
  @Get()
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  async listPayments(@CurrentUser() user: CurrentUserData, @Query() query: ListPaymentsQueryDto) {
    if (user.permissions.includes('payment.read')) {
      return this.paymentService.listPayments({
        tradeId: query.tradeId,
        customerId: query.customerId,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });
    }
    return this.paymentService.listOwnPayments(user.userId, query);
  }

  /**
   * GET /payments/summary
   * Aggregates for the authenticated customer's ledger window.
   * Staff callers are scoped to their own customer profile, never to a query customerId.
   */
  @Get('summary')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  async summarizePayments(
    @CurrentUser() user: CurrentUserData,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentService.summarizeOwn(user.userId, query);
  }

  /** Confirmed trades the signed-in customer can attach a receipt to. */
  @Get('receipts/trades')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  listPayableTrades(@CurrentUser() user: CurrentUserData) {
    return this.paymentService.listOwnPayableTrades(user.userId);
  }

  /**
   * Customer uploads a receipt and creates a PENDING payment on their own trade.
   */
  @Post('receipts')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_RECEIPT_BYTES } }))
  submitReceipt(
    @CurrentUser() user: CurrentUserData,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { tradeId?: string; method?: string; amount?: string; referenceNumber?: string },
  ) {
    if (!file || file.size <= 0) throw new BadRequestException('فایل رسید انتخاب نشده است.');
    if (!body.tradeId || !body.method || !body.amount) {
      throw new BadRequestException('اطلاعات پرداخت ناقص است.');
    }
    if (!Object.values(PaymentMethod).includes(body.method as PaymentMethod)) {
      throw new BadRequestException('روش پرداخت نامعتبر است.');
    }
    return this.paymentService.submitOwnReceipt(user.userId, {
      tradeId: body.tradeId,
      method: body.method as PaymentMethod,
      amount: body.amount,
      referenceNumber: body.referenceNumber,
      file,
    });
  }

  /**
   * POST /payments/:id/validate
   * Validate a PENDING payment (accountant confirmation).
   * Transitions: PENDING → VALIDATED
   */
  @Post(':id/validate')
  @RequirePermissions('payment.validate')
  async validatePayment(
    @Param('id') id: string,
    @Body() _dto: ValidatePaymentDto,
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.paymentService.validatePayment(id, requireActorId(req.user));
  }

  /**
   * POST /payments/:id/allocate
   * Allocate a VALIDATED payment to a Trade.
   * Transitions: VALIDATED → ALLOCATED (→ COMPLETED if fully paid)
   *
   * CONCURRENCY: protected by SELECT FOR UPDATE on Trade row.
   */
  @Post(':id/allocate')
  @RequirePermissions('payment.allocate')
  async allocatePayment(
    @Param('id') id: string,
    @Body() dto: AllocatePaymentDto,
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.paymentService.allocatePayment(id, dto, requireActorId(req.user));
  }

  /**
   * GET /payments/trade/:tradeId
   * Registered before :id so "trade" is not captured as a payment id.
   * Customers only receive the status of their own trade.
   */
  @Get('trade/:tradeId')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  async getTradePaymentStatus(
    @CurrentUser() user: CurrentUserData,
    @Param('tradeId') tradeId: string,
  ) {
    return this.paymentService.getTradePaymentStatusForActor(
      user.userId,
      tradeId,
      user.permissions.includes('payment.read'),
    );
  }

  /**
   * Private receipt file. Owner or staff only. Missing and foreign ids both 404.
   */
  @Get(':id/receipt')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  async readReceipt(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    const file = await this.paymentService.readReceiptForActor(
      user.userId,
      id,
      user.permissions.includes('payment.read'),
    );
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `inline; filename="${encodeURIComponent(file.fileName)}"`,
    });
  }

  /**
   * GET /payments/:id
   * Staff can read any payment. Customers receive 404 for a payment they do not own.
   */
  @Get(':id')
  @RequireAnyPermission('payment.read', 'customer.payment.read_own')
  async getPayment(@CurrentUser() user: CurrentUserData, @Param('id') id: string) {
    return this.paymentService.getPaymentForActor(
      user.userId,
      id,
      user.permissions.includes('payment.read'),
    );
  }
}
