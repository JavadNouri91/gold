import { Global, Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AuditLogRepository } from './infrastructure/repositories/audit-log.repository';

/**
 * Audit module — global so all other modules can inject AuditService.
 *
 * Business rule: BR-S02 — Sensitive operations must be audited.
 * Architecture ref: docs/16-notifications-and-audit.md
 */
@Global()
@Module({
  providers: [AuditService, AuditLogRepository],
  exports: [AuditService],
})
export class AuditModule {}
