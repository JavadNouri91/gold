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
import { FeePolicyRepository } from './infrastructure/repositories/fee-policy.repository';
import { TransactionFeeService } from './application/transaction-fee.service';

@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    PricingEngineService,
    TransactionFeeService,
    {
      provide: PRICE_PROVIDER_TOKEN,
      useClass: MockPriceProviderAdapter,
    },
    {
      provide: PRICE_NORMALIZER_TOKEN,
      useClass: MockPriceNormalizerAdapter,
    },
    PriceSourceRepository,
    PriceSnapshotRepository,
    PriceAdjustmentRepository,
    PricingRuleRepository,
    PricingCalculationRepository,
    FeePolicyRepository,
  ],
  exports: [
    PricingService,
    PricingEngineService,
    TransactionFeeService,
    PriceSnapshotRepository,
    PricingCalculationRepository,
    FeePolicyRepository,
  ],
})
export class PricingModule {}
