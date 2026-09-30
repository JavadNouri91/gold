import { Module } from '@nestjs/common';
import { PaymentController } from './presentation/controllers/payment.controller';
import { PaymentService } from './application/payment.service';
import { PaymentRepository } from './infrastructure/repositories/payment.repository';
import { SettlementsModule } from '../settlements/settlements.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Payments Module � Phase 5
 *
 * Implements the full Payment + Allocation + Settlement vertical slice.
 *
 * PAYMENT FLOW (docs/08-workflows.md �8.5):
 *   1. Accountant records Payment     ? Payment(PENDING)
 *   2. Accountant validates Payment   ? Payment(VALIDATED)
 *   3. Allocate Payment to Trade      ? Payment(ALLOCATED) + PaymentAllocation
 *   4. 100% paid ? Settlement(SETTLED) + Trade(COMPLETED)
 *
 * LEDGER POSTING � BLOCKED:
 *   The specific DR/CR journal entry rules for payment receipt are NOT
 *   documented in docs/21-business-decisions.md �6.
 *   FA-04 (Cash), FA-05 (Bank), FA-12 (Customer Settlement Clearing) exist
 *   but no explicit DR/CR posting template for payment is documented.
 *   Pending business clarification � will not implement until documented.
 *
 * PAYMENT REVERSAL � BLOCKED:
 *   �4.2 mentions "Payment reversal (Manager approval required)" but the
 *   reversal rules (ledger entries, state transitions) are not documented.
 *
 * CREDIT INTERACTION � BLOCKED:
 *   Whether Payment recording affects CustomerAccount.consumedCreditRial
 *   is not documented (�3.3 / �8.3). Not implemented.
 *
 * Payment methods supported (MVP): BANK_TRANSFER, CARD_TO_CARD, CASH (�9.1)
 * Online Payment Gateway: DEFERRED (�13.7)
 *
 * CONCURRENCY (�13):
 *   SELECT FOR UPDATE on Trade row prevents concurrent over-allocation.
 *
 * docs/21-business-decisions.md �8, �9
 * architecture/STATE-MACHINES.md (Payment state machine)
 */
@Module({
  imports: [SettlementsModule, AuditModule, NotificationsModule],
  controllers: [PaymentController],
  providers: [PaymentService, PaymentRepository],
  exports: [PaymentService, PaymentRepository],
})
export class PaymentsModule {}
