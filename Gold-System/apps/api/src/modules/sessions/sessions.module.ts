import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SessionAdminService } from './application/session-admin.service';
import { SessionEnforcementService } from './application/session-enforcement.service';
import { SessionPoliciesController } from './presentation/session-policies.controller';
import { UserSessionsController } from './presentation/user-sessions.controller';

@Module({
  imports: [AuditModule],
  providers: [SessionEnforcementService, SessionAdminService],
  controllers: [SessionPoliciesController, UserSessionsController],
  exports: [SessionEnforcementService],
})
export class SessionsModule {}
