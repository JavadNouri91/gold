import { Module } from '@nestjs/common';
import { PurchaseController } from './presentation/controllers/purchase.controller';
import { PurchaseService } from './application/purchase.service';
import { PurchaseLedgerService } from './application/purchase-ledger.service';
import { PurchaseRepository } from './infrastructure/repositories/purchase.repository';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { FinancialLedgerModule } from '../financial-ledger/financial-ledger.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Purchases Module � Phase 6
 *
 * Implements the upstream gold Purchase vertical slice.
 * Manual entry only (docs/21-business-decisions.md �11.2).
 *
 * STATE MACHINE:
 *   DRAFT ? CONFIRMED (MVP)
 *   SETTLING / SETTLED: DEFERRED �8.4
 *
 * FINANCIAL LEDGER (on CONFIRMED):
 *   DR FA-08 (Purchase Cost) / CR FA-03 (Supplier Payable)
 *   Source: docs/14-accounting.md + �6.1
 *
 * GOLD LEDGER � BLOCKED:
 *   GA-01 IN posting � open-questions.md #22 and #39 OPEN
 *   Consistent with Phase 4 block on GA-01 at Trade confirmation.
 *
 * ATOMICITY:
 *   Purchase confirmation + Financial Ledger + SupplierAccount update
 *   are one atomic Prisma $transaction.
 *
 * API ADAPTER BOUNDARY:
 *   PurchaseLedgerService is the clean boundary between business logic
 *   and ledger infrastructure � future API adapter posts here.
 *
 * docs/07-business-rules.md BR-U01, BR-U02, BR-U03
 * docs/05-use-cases.md UC-13
 */
@Module({
  imports: [SuppliersModule, FinancialLedgerModule, AuditModule],
  controllers: [PurchaseController],
  providers: [PurchaseService, PurchaseLedgerService, PurchaseRepository],
  exports: [PurchaseService, PurchaseRepository],
})
export class PurchasesModule {}
