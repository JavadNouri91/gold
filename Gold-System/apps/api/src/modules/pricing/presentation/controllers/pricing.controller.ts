import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { PricingService } from '../../application/pricing.service';
import { CalculatePriceDto } from '../../application/dto/calculate-price.dto';
import { CreatePricingRuleDto } from '../../application/dto/create-pricing-rule.dto';
import { CreatePriceAdjustmentDto } from '../../application/dto/create-price-adjustment.dto';
import {
  CreateFeePolicyDto,
  UpdateFeePolicyDto,
} from '../../application/dto/create-fee-policy.dto';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { CustomerType, TradeSide } from '@gold/shared-types';

@ApiTags('pricing')
@ApiBearerAuth()
@Controller('pricing')
export class PricingController {
  constructor(private readonly service: PricingService) {}

  // ── UC-06: Get current live price (all authenticated users) ──────────────
  @Get('current-price')
  @ApiOperation({
    summary: 'UC-06: Get current live gold price (latest valid snapshot)',
  })
  @ApiResponse({
    status: 422,
    description: 'No valid price snapshot available — provider must be polled',
  })
  getCurrentPrice() {
    return this.service.getCurrentPrice();
  }

  // ── On-demand price refresh (staff only) ─────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'Trigger on-demand price snapshot from provider (staff only)' })
  refreshPrice() {
    return this.service.refreshPrice();
  }

  // ── Calculate price ───────────────────────────────────────────────────────
  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate customer price for given weight and type — pipeline Steps 1–10',
    description: [
      'Executes the full pricing pipeline.',
      'BLOCKED steps: Profit (§13.2) and Tax (§13.3) are not computed.',
      'isComplete = false until those decisions are resolved.',
      'Returns an immutable PricingCalculation ID for referencing from orders.',
    ].join(' '),
  })
  calculate(
    @Body() dto: CalculatePriceDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.service.calculate(dto, user, req.ip ?? undefined);
  }

  // ── Get calculation by ID (for Order/Quotation reference) ────────────────
  @Get('calculations/:id')
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'Get pricing calculation record by ID' })
  getCalculation(@Param('id') id: string) {
    return this.service.getCalculation(id);
  }

  // ── List pricing rules (staff) ────────────────────────────────────────────
  @Get('rules')
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'List pricing rules (configurable per CustomerType)' })
  listRules(@Query('customerType') customerType?: CustomerType) {
    return this.service.listRules(customerType);
  }

  // ── Create pricing rule (staff — Store Manager) ───────────────────────────
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'Create a pricing rule for a customer type' })
  createRule(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createRule(dto, user.userId);
  }

  // ── List global price adjustments (staff) ────────────────────────────────
  @Get('adjustments')
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'List global seller price adjustments (Step 2)' })
  listAdjustments() {
    return this.service.listAdjustments();
  }

  // ── Create global price adjustment (staff — Store Manager) ────────────────
  @Post('adjustments')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('pricing.rules.manage')
  @ApiOperation({ summary: 'Create a global seller price adjustment (+/- % or fixed)' })
  createAdjustment(@Body() dto: CreatePriceAdjustmentDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createAdjustment(dto, user.userId);
  }

  // ── Customer-type BUY/SELL fee policies ───────────────────────────────────
  @Get('fee-policies')
  @RequirePermissions('pricing.fees.manage')
  @ApiOperation({ summary: 'List customer-type BUY/SELL transaction fee policies' })
  listFeePolicies(
    @Query('customerType') customerType?: CustomerType,
    @Query('side') side?: TradeSide,
  ) {
    return this.service.listFeePolicies({ customerType, side });
  }

  @Post('fee-policies')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('pricing.fees.manage')
  @ApiOperation({ summary: 'Create a customer-type BUY/SELL transaction fee policy' })
  createFeePolicy(@Body() dto: CreateFeePolicyDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createFeePolicy(dto, user.userId);
  }

  @Patch('fee-policies/:id')
  @RequirePermissions('pricing.fees.manage')
  @ApiOperation({ summary: 'Update a customer-type fee policy' })
  updateFeePolicy(
    @Param('id') id: string,
    @Body() dto: UpdateFeePolicyDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.updateFeePolicy(id, dto, user.userId);
  }
}
