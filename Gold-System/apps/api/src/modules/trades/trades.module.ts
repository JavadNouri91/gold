import { Module } from '@nestjs/common';
import { TradesController } from './presentation/controllers/trades.controller';
import { TradesService } from './application/trades.service';
import { TradeRepository } from './infrastructure/repositories/trade.repository';
import { OrdersModule } from '../orders/orders.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module';
import { AuditModule } from '../audit/audit.module';
import { FinancialLedgerModule } from '../financial-ledger/financial-ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TradingPolicyModule } from '../trading-policy/trading-policy.module';

/**
 * Trades module � Phase 3.6 + Phase 4 Ledger Integration
 *
 * Implements the Trade + Final Confirmation vertical slice:
 *   - UC-11: Confirm Trade (POST /trades � atomic, concurrency-safe)
 *   - UC-12: View Trade details (GET /trades/:id � customer isolation)
 *   - Trade Reversal: POST /trades/:id/reverse (�4.2 � Manager authorization)
 *
 * Phase 4 Ledger Integration:
 *   - Trade confirmation creates financial and gold ledger postings atomically
 *   - Trade reversal creates reversal ledger entries atomically
 *   - Idempotency: retry-safe via unique idempotency keys
 *   - Postings: DR FA-02 / CR FA-06 + GA-02 IN (docs/21-business-decisions.md �6)
 *
 * BLOCKED postings (not implemented � pending business decisions):
 *   - FA-07 (profit): �13.2
 *   - FA-09 (tax): �13.3
 *   - GA-01: open-questions.md #39
 *
 * Depends on:
 *   - OrdersModule: OrderRepository
 *   - QuotationsModule: QuotationRepository
 *   - CustomerAccountsModule: CustomerAccountRepository
 *   - AuditModule: AuditService
 *   - FinancialLedgerModule: TradeLedgerPostingService (which includes GoldLedgerModule)
 *
 * docs/04-actors-and-permissions.md
 * docs/05-use-cases.md UC-11, UC-12
 * docs/21-business-decisions.md �3.3, �4.2, �6
 * architecture/STATE-MACHINES.md: APPROVED ? TRADE_CREATED
 */
@Module({
  imports: [
    OrdersModule,
    QuotationsModule,
    CustomerAccountsModule,
    AuditModule,
    FinancialLedgerModule,
    NotificationsModule,
    TradingPolicyModule,
  ],
  controllers: [TradesController],
  providers: [TradesService, TradeRepository],
  exports: [TradesService, TradeRepository],
})
export class TradesModule {}
