import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { CurrentUser, CurrentUserData } from '../../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../../common/decorators/permissions.decorator';
import { ConnectProductSyncService } from '../../application/connect-product-sync.service';
import { ConnectShadowPricingService } from '../../application/connect-shadow-pricing.service';
import { ConnectProductMappingDto, ConnectProductsQueryDto } from '../dto/connect-products.dto';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

class SelectShadowReferenceDto {
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @IsIn(['buy_price', 'sell_price']) priceField?: 'buy_price' | 'sell_price' | null;
}

class ShadowMaxAgeDto {
  @IsInt() @Min(30) @Max(3600) maxAgeSeconds: number;
}

class SelectCashReferenceDto {
  @IsIn(['CASH_SPOT', 'CASH_TOMORROW', 'CASH_DAY_AFTER_TOMORROW']) category: 'CASH_SPOT' | 'CASH_TOMORROW' | 'CASH_DAY_AFTER_TOMORROW';
  @IsOptional() @IsString() productId?: string | null;
}

class ShadowDisplayModeDto {
  @IsIn(['MESGHAL', 'GRAM', 'BOTH']) mode: 'MESGHAL' | 'GRAM' | 'BOTH';
}

@Controller({ path: 'admin/integrations/connect/products', version: '1' })
export class ConnectProductsController {
  constructor(
    private readonly products: ConnectProductSyncService,
    private readonly shadowPricing: ConnectShadowPricingService,
  ) {}

  @Get('shadow-reference')
  @RequirePermissions('connect.products.read')
  shadowReference() {
    return this.shadowPricing.getPreview();
  }

  @Get('cash-shadow')
  @RequirePermissions('connect.products.read')
  cashShadow() { return this.shadowPricing.getCashPreview(); }

  @Put('cash-shadow/reference')
  @RequirePermissions('connect.products.mapping.manage')
  selectCashReference(@Body() dto: SelectCashReferenceDto, @CurrentUser() actor: CurrentUserData, @Req() req: Request) {
    return this.shadowPricing.selectCashReference(dto.category, dto.productId ?? null, actor.userId, req.ip);
  }

  @Put('cash-shadow/display-mode')
  @RequirePermissions('connect.products.mapping.manage')
  setDisplayMode(@Body() dto: ShadowDisplayModeDto, @CurrentUser() actor: CurrentUserData, @Req() req: Request) {
    return this.shadowPricing.setDisplayMode(dto.mode, actor.userId, req.ip);
  }

  @Put('shadow-reference')
  @RequirePermissions('connect.products.mapping.manage')
  selectShadowReference(
    @Body() dto: SelectShadowReferenceDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.shadowPricing.selectCandidate(dto.productId ?? null, dto.priceField ?? null, actor.userId, req.ip);
  }

  @Put('shadow-reference/max-age')
  @RequirePermissions('connect.products.mapping.manage')
  setShadowMaxAge(
    @Body() dto: ShadowMaxAgeDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.shadowPricing.setMaxAge(dto.maxAgeSeconds, actor.userId, req.ip);
  }

  @Get()
  @RequirePermissions('connect.products.read')
  list(@Query() query: ConnectProductsQueryDto) {
    return this.products.list(query);
  }

  @Get('sync-status')
  @RequirePermissions('connect.products.read')
  syncStatus() {
    return this.products.syncStatus();
  }

  @Post('sync')
  @Throttle({ short: { limit: 1, ttl: 30_000 }, long: { limit: 5, ttl: 60_000 } })
  @RequirePermissions('connect.products.sync')
  sync(@CurrentUser() actor: CurrentUserData, @Req() req: Request) {
    return this.products.sync(actor.userId, req.ip);
  }

  @Get(':id/mapping')
  @RequirePermissions('connect.products.read')
  getMapping(@Param('id') id: string) {
    return this.products.getMapping(id);
  }

  @Put(':id/mapping')
  @RequirePermissions('connect.products.mapping.manage')
  saveMapping(
    @Param('id') id: string,
    @Body() dto: ConnectProductMappingDto,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.products.saveMapping(id, { ...dto }, actor.userId, req.ip);
  }

  @Post(':id/mapping/verify')
  @RequirePermissions('connect.products.mapping.verify')
  verifyMapping(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.products.verifyMapping(id, actor.userId, req.ip);
  }

  @Post(':id/mapping/disable')
  @RequirePermissions('connect.products.mapping.manage')
  disableMapping(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserData,
    @Req() req: Request,
  ) {
    return this.products.disableMapping(id, actor.userId, req.ip);
  }

  @Get(':id')
  @RequirePermissions('connect.products.read')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }
}
