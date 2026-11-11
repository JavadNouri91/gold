import { Module } from '@nestjs/common';
import { ConnectSettingsController } from './presentation/controllers/connect-settings.controller';
import { ConnectSettingsService } from './application/connect-settings.service';
import { ConnectHttpClient } from './infrastructure/connect-http.client';
import { ConnectProductsController } from './presentation/controllers/connect-products.controller';
import { ConnectProductSyncService } from './application/connect-product-sync.service';
import { ConnectShadowPricingService } from './application/connect-shadow-pricing.service';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [PricingModule],
  controllers: [ConnectSettingsController, ConnectProductsController],
  providers: [ConnectSettingsService, ConnectProductSyncService, ConnectHttpClient, ConnectShadowPricingService],
  exports: [ConnectSettingsService, ConnectProductSyncService],
})
export class ConnectModule {}
