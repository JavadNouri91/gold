import { Controller, Get, HttpCode, HttpStatus, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { QuotationsService } from '../../application/quotations.service';
import { ListQuotationsDto } from '../../application/dto/list-quotations.dto';

/**
 * Quotations REST API.
 *
 * All endpoints require authentication (JwtAuthGuard at class level).
 *
 * Authorization model:
 *   - Customers: view own quotations; download own quotation documents
 *   - Staff with quotation.read: view any quotation
 *
 * Customer isolation: customers NEVER access another customer's quotations.
 * Returns 404 (not 403) for another customer's quotation to prevent enumeration.
 *
 * Documented API (API-ARCHITECTURE.md):
 *   GET /orders/:id/quotations   → getQuotationsForOrder (in OrdersController)
 *   GET /quotations/:id          → getQuotation
 *   GET /quotations/:id/download → downloadQuotation
 *
 * docs/21-business-decisions.md §2, §2.1, §2.2, §2.3
 */
@UseGuards(JwtAuthGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  /**
   * GET /quotations
   * List quotations for the authenticated user.
   *
   * Customer: own quotations only (customer isolation).
   * Staff: all quotations (future — Phase 3.4 implements customer-scoped only).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async listQuotations(@CurrentUser() user: CurrentUserData, @Query() query: ListQuotationsDto) {
    const isStaff = user.permissions.includes('quotation.read');
    return this.quotationsService.listQuotations(user.userId, query, isStaff);
  }

  /**
   * GET /quotations/:id
   * Get quotation details.
   *
   * Customer: only own quotations — returns 404 for another customer's quotation.
   * Staff with quotation.read: any quotation.
   *
   * IMMUTABILITY: The returned values are the locked snapshot from Order submission time.
   * They do NOT reflect current gold prices.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getQuotation(@CurrentUser() user: CurrentUserData, @Param('id') quotationId: string) {
    const isStaff = user.permissions.includes('quotation.read');
    return this.quotationsService.getQuotation(quotationId, user.userId, isStaff);
  }

  /**
   * GET /quotations/:id/download
   * Get a pre-signed URL to download the quotation document.
   *
   * AUDIT: Every download is audited (BR-S02).
   * CUSTOMER ISOLATION: Customers can only download their own documents.
   * IMMUTABILITY: The document represents the locked pricing snapshot — not a live price.
   *
   * Returns: pre-signed URL (expires per STORAGE_SIGNED_URL_TTL_SECONDS).
   */
  @Get(':id/download')
  @HttpCode(HttpStatus.OK)
  async downloadQuotation(@CurrentUser() user: CurrentUserData, @Param('id') quotationId: string) {
    const isStaff = user.permissions.includes('quotation.read');
    return this.quotationsService.getDownloadUrl(quotationId, user.userId, isStaff);
  }
}
