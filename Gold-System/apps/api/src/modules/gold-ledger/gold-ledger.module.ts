import { Module } from '@nestjs/common';
import { GoldLedgerController } from './presentation/controllers/gold-ledger.controller';
import { GoldLedgerService } from './application/gold-ledger.service';
import { GoldLedgerRepository } from './infrastructure/repositories/gold-ledger.repository';

/**
 * Gold Ledger Module � Phase 4
 *
 * Tracks physical/contractual gold weight movements.
 * Source: docs/21-business-decisions.md �6.2
 *
 * Gold Accounts:
 * - GA-01: Store Gold Position (gold purchased from upstream)
 * - GA-02: Gold Obligation to Customer (gold committed via confirmed Trade)
 * - GA-03: Gold Reversal / Adjustment
 *
 * NOTE: Customer gold capacity is Rial-based (CustomerAccount.credit_limit_gold_rial).
 * GoldLedgerEntry belongs to store-level accounts only.
 *
 * BLOCKED postings:
 * - GA-01 update at Trade confirmation vs delivery: open-questions.md #39
 *   (Only GA-01 from upstream purchases, when that rule is documented)
 *
 * Authorization:
 * - All API endpoints require `ledger.read` or `ledger.reconcile` permission
 */
@Module({
  controllers: [GoldLedgerController],
  providers: [GoldLedgerService, GoldLedgerRepository],
  exports: [GoldLedgerService, GoldLedgerRepository],
})
export class GoldLedgerModule {}
