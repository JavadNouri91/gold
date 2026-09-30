import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './presentation/controllers/orders.controller';
import { OrdersService } from './application/orders.service';
import { CustomerActivityService } from './application/customer-activity.service';
import { OrderRepository } from './infrastructure/repositories/order.repository';

import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module';
import { PricingModule } from '../pricing/pricing.module';
import { AuditModule } from '../audit/audit.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TradingPolicyModule } from '../trading-policy/trading-policy.module';

/**
 * Orders module � Phase 3.3 / 3.4
 *
 * Phase 3.3: Order creation, submission (credit reservation), cancellation, rejection.
 * Phase 3.4: Integrated with QuotationsModule for auto-generation on submit
 *             and Quotation expiry on cancel/reject.
 *
 * Depends on:
 *   - CustomerAccountsModule: CustomerAccountRepository (credit reservation/release)
 *   - PricingModule: PricingEngineService (order total calculation)
 *   - AuditModule: AuditService (immutable audit log)
 *   - QuotationsModule: QuotationsService (auto-generate + expire Quotation)
 *
 * docs/21-business-decisions.md �3.3, �3.4, �3.5, �4.1, �2.3
 * architecture/STATE-MACHINES.md (Order + Quotation state machines)
 */
@Module({
  imports: [
    CustomerAccountsModule,
    PricingModule,
    AuditModule,
    forwardRef(() => QuotationsModule),
    NotificationsModule,
    TradingPolicyModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, CustomerActivityService, OrderRepository],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
