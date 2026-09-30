import { Module } from '@nestjs/common';
import { QuotationsController } from './presentation/controllers/quotations.controller';
import { QuotationsService } from './application/quotations.service';
import { QuotationDocumentService } from './application/quotation-document.service';
import { QuotationRepository } from './infrastructure/repositories/quotation.repository';
import { AuditModule } from '../audit/audit.module';

/**
 * Quotations module � Phase 3.4
 *
 * Vertical slice: automatic Quotation generation after Order submission,
 * Quotation expiry on Order cancellation/rejection, customer access to quotations
 * and document download.
 *
 * Depends on:
 *   - AuditModule: AuditService for immutable audit log
 *   - StorageModule: StorageService (global � no import needed) for document upload/download
 *
 * Exported services are consumed by OrdersModule to integrate Quotation
 * lifecycle into Order operations (generation on submit, expiry on cancel/reject).
 *
 * docs/21-business-decisions.md �2, UC-08
 * architecture/STATE-MACHINES.md (Quotation state machine)
 */
@Module({
  imports: [AuditModule],
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationDocumentService, QuotationRepository],
  exports: [QuotationsService, QuotationRepository],
})
export class QuotationsModule {}
