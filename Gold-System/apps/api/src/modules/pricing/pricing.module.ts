import { Module } from '@nestjs/common';
import { PricingController } from './presentation/controllers/pricing.controller';
import { PricingService } from './application/pricing.service';
import { PricingEngineService } from './application/pricing-engine.service';

// Ports + tokens
import { PRICE_PROVIDER_TOKEN, PRICE_NORMALIZER_TOKEN } from './domain/ports/price-provider.port';

// Development adapters
import { MockPriceProviderAdapter } from './infrastructure/adapters/mock-price-provider.adapter';
import { MockPriceNormalizerAdapter } from './infrastructure/adapters/mock-price-normalizer.adapter';

// Repositories
import { PriceSourceRepository } from './infrastructure/repositories/price-source.repository';
import { PriceSnapshotRepository } from './infrastructure/repositories/price-snapshot.repository';
import { PriceAdjustmentRepository } from './infrastructure/repositories/price-adjustment.repository';
import { PricingRuleRepository } from './infrastructure/repositories/pricing-rule.repository';
import { PricingCalculationRepository } from './infrastructure/repositories/pricing-calculation.repository';

@Module({
  controllers: [PricingController],
  providers: [
    // ?? Application layer ??????????????????????????????????
    PricingService,
    PricingEngineService,

    // ?? Provider port � swap for real adapter in production ?
    // When �13.1 is resolved and a real provider is selected:
    //   Replace MockPriceProviderAdapter with the concrete adapter
    //   Replace MockPriceNormalizerAdapter with the correct normalizer
    {
      provide: PRICE_PROVIDER_TOKEN,
      useClass: MockPriceProviderAdapter,
    },
    {
      provide: PRICE_NORMALIZER_TOKEN,
      useClass: MockPriceNormalizerAdapter,
    },

    // ?? Repositories ???????????????????????????????????????
    PriceSourceRepository,
    PriceSnapshotRepository,
    PriceAdjustmentRepository,
    PricingRuleRepository,
    PricingCalculationRepository,
  ],
  exports: [
    PricingService,
    PricingEngineService,
    PriceSnapshotRepository,
    PricingCalculationRepository,
  ],
})
export class PricingModule {}
