import { Module } from '@nestjs/common';
import { AssignmentsController } from './presentation/controllers/assignments.controller';
import { AssignmentsService } from './application/assignments.service';
import { AssignmentRepository } from './infrastructure/repositories/assignment.repository';
import { OrdersModule } from '../orders/orders.module';
import { QuotationsModule } from '../quotations/quotations.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Assignments module � Phase 3.5
 *
 * Implements the Assignment and Manual Review workflow:
 *   - UC-09: Assign Order to Reviewer (Operator)
 *   - UC-10: Review Trade (Reviewer: approve/reject/request revision)
 *
 * Depends on:
 *   - OrdersModule: OrderRepository (read Order state, validate transitions)
 *   - QuotationsModule: QuotationRepository (find active Quotation for assignment)
 *   - AuditModule: AuditService (immutable audit log)
 *
 * Review decision endpoints (approve/reject/request-revision) are in
 * OrdersModule/OrdersController because they are Order state transitions.
 * AssignmentsService handles Assignment lifecycle (create, reassign, cancel).
 *
 * docs/04-actors-and-permissions.md
 * docs/05-use-cases.md UC-09, UC-10
 * architecture/STATE-MACHINES.md: QUOTED?ASSIGNED?UNDER_REVIEW?...
 */
@Module({
  imports: [OrdersModule, QuotationsModule, AuditModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentRepository],
  exports: [AssignmentsService, AssignmentRepository],
})
export class AssignmentsModule {}
