export interface CreateAuditLogDto {
  actorId: string | null;
  actorType?: string; // default: 'USER'
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  ipAddress?: string;
  correlationId?: string;
}
