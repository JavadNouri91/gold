import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TradingAdminService } from './application/trading-admin.service';
import { TRADING_CLOCK, TradingPolicyService } from './application/trading-policy.service';
import { TradingRepository } from './infrastructure/trading.repository';
import { TradingController } from './presentation/trading.controller';

@Module({
  imports: [AuditModule],
  controllers: [TradingController],
  providers: [
    TradingRepository,
    TradingPolicyService,
    TradingAdminService,
    { provide: TRADING_CLOCK, useValue: () => new Date() },
  ],
  exports: [TradingPolicyService],
})
export class TradingPolicyModule {}
