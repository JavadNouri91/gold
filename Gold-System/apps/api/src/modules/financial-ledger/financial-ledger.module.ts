import { Module } from '@nestjs/common';
import { FinancialLedgerController } from './presentation/controllers/financial-ledger.controller';
import { FinancialLedgerService } from './application/financial-ledger.service';
import { TradeLedgerPostingService } from './application/trade-ledger-posting.service';
import { FinancialLedgerRepository } from './infrastructure/repositories/financial-ledger.repository';
import { AuditModule } from '../audit/audit.module';
import { GoldLedgerModule } from '../gold-ledger/gold-ledger.module';

/**
 * Financial Ledger Module � Phase 4
 *
 * Implements double-entry financial bookkeeping.
 * Source: docs/21-business-decisions.md �6.1, �6.3
 *
 * Chart of Accounts: FA-01 through FA-15 (see domain/constants/chart-of-accounts.ts)
 *
 * Exports:
 * - FinancialLedgerService: for read/balance/reconciliation
 * - TradeLedgerPostingService: for Trade confirmation/reversal postings
 *   (used by TradesModule to create ledger entries within Trade transactions)
 *
 * Authorization:
 * - All API endpoints require `ledger.read` or `ledger.reconcile` permission
 * - Customers MUST NOT access ledger endpoints
 *
 * BLOCKED accounts (not postable until business decisions resolved):
 * - FA-07: �13.2 � profit calculation base undefined
 * - FA-09: �13.3 � tax rate and taxable base undefined
 * - FA-13: �8.4 � supplier settlement deferred from MVP
 */
@Module({
  imports: [AuditModule, GoldLedgerModule],
  controllers: [FinancialLedgerController],
  providers: [FinancialLedgerService, TradeLedgerPostingService, FinancialLedgerRepository],
  exports: [FinancialLedgerService, TradeLedgerPostingService],
})
export class FinancialLedgerModule {}
