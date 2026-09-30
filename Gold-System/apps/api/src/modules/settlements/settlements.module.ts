import { Module } from '@nestjs/common';
import { SettlementController } from './presentation/controllers/settlement.controller';
import { SettlementService } from './application/settlement.service';
import { SettlementRepository } from './infrastructure/repositories/settlement.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * Settlements Module � Phase 5
 *
 * Tracks whether a Trade has been fully settled (100% paid).
 * One Settlement record per Trade (created/updated by PaymentModule).
 *
 * �8.1: A Trade is fully settled when 100% of Trade total has been paid.
 * �8.2: No installment payments � full payment required.
 * �8.3: No payment deadline � Accountant manages manually.
 *
 * docs/21-business-decisions.md �8
 * architecture/STATE-MACHINES.md (Payment/Settlement state machine)
 *
 * Note: Settlement write operations (upsert) are performed by PaymentService
 * inside the allocation transaction to maintain atomicity.
 * SettlementService provides read-only access.
 */
@Module({
  imports: [AuditModule],
  controllers: [SettlementController],
  providers: [SettlementService, SettlementRepository],
  exports: [SettlementService, SettlementRepository],
})
export class SettlementsModule {}
