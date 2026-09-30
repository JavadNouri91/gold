import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from '../infrastructure/repositories/audit-log.repository';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { AuditLogEntity } from '../domain/entities/audit-log.entity';

/**
 * Audit Service — write-only log of sensitive operations.
 *
 * RULES (from docs/21-business-decisions.md §6.3):
 * - Entries are append-only; never updated or deleted.
 * - Every call to `log()` must succeed or throw — never silently fail.
 * - The caller is responsible for providing accurate before/after snapshots.
 */
@Injectable()
export class AuditService {
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  async log(dto: CreateAuditLogDto): Promise<AuditLogEntity> {
    return this.auditLogRepository.create({
      actorId: dto.actorId,
      actorType: dto.actorType ?? 'USER',
      action: dto.action,
      entityType: dto.entityType,
      entityId: dto.entityId,
      before: dto.before ?? null,
      after: dto.after ?? null,
      reason: dto.reason ?? null,
      ipAddress: dto.ipAddress ?? null,
      correlationId: dto.correlationId ?? null,
    });
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLogEntity[]> {
    return this.auditLogRepository.findByEntity(entityType, entityId);
  }

  async findByActor(actorId: string, limit = 100): Promise<AuditLogEntity[]> {
    return this.auditLogRepository.findByActor(actorId, limit);
  }
}
