import { Controller, Get, Post, Param, Body, UseGuards, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { requireActorId } from '../../../../common/auth/require-actor-id';
import { PurchaseService } from '../../application/purchase.service';
import { PurchaseSettlementType, PurchaseStatus } from '../../domain/constants/purchase-states';

/**
 * Purchase Controller
 *
 * RBAC:
 *   purchase.create  — Manager / Operator / Accountant
 *   purchase.confirm — Manager / Operator
 *   purchase.read    — Any authorized staff
 *
 * Customers MUST NOT access purchase management.
 * docs/05-use-cases.md UC-13
 */
@Controller('purchases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  /** POST /purchases — Create a DRAFT purchase */
  @Post()
  @RequirePermissions('purchase.create')
  create(
    @Body()
    body: {
      idempotencyKey: string;
      supplierId: string;
      settlementType: PurchaseSettlementType;
      purchaseDate: string;
      totalAmountRial: string;
      weightGrams: string;
      purityRatio: string;
      pricePerGramRial: string;
      supplierReference?: string;
      notes?: string;
    },
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.purchaseService.createPurchase(
      { ...body, purchaseDate: new Date(body.purchaseDate) },
      requireActorId(req.user),
    );
  }

  /** GET /purchases — List purchases */
  @Get()
  @RequirePermissions('purchase.read')
  list(
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.purchaseService.listPurchases({
      supplierId,
      status: status as PurchaseStatus | undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  /** GET /purchases/:id — Get purchase details */
  @Get(':id')
  @RequirePermissions('purchase.read')
  getOne(@Param('id') id: string) {
    return this.purchaseService.getPurchaseById(id);
  }

  /** POST /purchases/:id/confirm — Confirm DRAFT → CONFIRMED */
  @Post(':id/confirm')
  @RequirePermissions('purchase.confirm')
  confirm(@Param('id') id: string, @Request() req: { user: { userId?: string; sub?: string } }) {
    return this.purchaseService.confirmPurchase(id, requireActorId(req.user));
  }

  /** POST /purchases/:id/cancel — Cancel DRAFT purchase */
  @Post(':id/cancel')
  @RequirePermissions('purchase.create')
  cancel(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req: { user: { userId?: string; sub?: string } },
  ) {
    return this.purchaseService.cancelPurchase(id, body.reason, requireActorId(req.user));
  }
}
