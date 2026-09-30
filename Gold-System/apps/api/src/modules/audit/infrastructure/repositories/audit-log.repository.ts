import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { AuditLogEntity } from '../../domain/entities/audit-log.entity';

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    actorId: string | null;
    actorType: string;
    action: string;
    entityType: string;
    entityId: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    reason: string | null;
    ipAddress: string | null;
    correlationId: string | null;
  }): Promise<AuditLogEntity> {
    const record = await this.prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        actorType: data.actorType,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        before: data.before ? (data.before as Prisma.InputJsonObject) : undefined,
        after: data.after ? (data.after as Prisma.InputJsonObject) : undefined,
        reason: data.reason,
        ipAddress: data.ipAddress,
        correlationId: data.correlationId,
      },
    });

    return this.toDomain(record);
  }

  async findByEntity(entityType: string, entityId: string): Promise<AuditLogEntity[]> {
    const records = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { timestamp: 'asc' },
    });
    return records.map((r) => this.toDomain(r));
  }

  async findByActor(actorId: string, limit: number): Promise<AuditLogEntity[]> {
    const records = await this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
    return records.map((r) => this.toDomain(r));
  }

  private toDomain(record: {
    id: string;
    actorId: string | null;
    actorType: string;
    action: string;
    entityType: string;
    entityId: string;
    before: unknown;
    after: unknown;
    reason: string | null;
    ipAddress: string | null;
    correlationId: string | null;
    timestamp: Date;
  }): AuditLogEntity {
    return new AuditLogEntity({
      id: record.id,
      actorId: record.actorId,
      actorType: record.actorType,
      action: record.action,
      entityType: record.entityType,
      entityId: record.entityId,
      before: record.before as Record<string, unknown> | null,
      after: record.after as Record<string, unknown> | null,
      reason: record.reason,
      ipAddress: record.ipAddress,
      correlationId: record.correlationId,
      timestamp: record.timestamp,
    });
  }
}
