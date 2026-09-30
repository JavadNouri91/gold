import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { SettlementService } from '../../application/settlement.service';

/**
 * Settlement Controller
 *
 * Read-only access to Settlement records.
 * Settlement records are created/updated automatically by the Payment allocation
 * flow — they are not created manually via this API.
 *
 * §8.1: A Trade is fully settled when 100% of Trade total has been paid.
 *
 * RBAC:
 *   settlement.read — view settlement status
 *
 * docs/21-business-decisions.md §8
 */
@Controller('settlements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  /**
   * GET /settlements/trade/:tradeId
   * Get settlement status for a specific Trade.
   */
  @Get('trade/:tradeId')
  @RequirePermissions('settlement.read')
  async getByTradeId(@Param('tradeId') tradeId: string) {
    return this.settlementService.getSettlementByTradeId(tradeId);
  }

  /**
   * GET /settlements/:id
   * Get a settlement record by its own ID.
   */
  @Get(':id')
  @RequirePermissions('settlement.read')
  async getById(@Param('id') id: string) {
    return this.settlementService.getSettlementById(id);
  }
}
