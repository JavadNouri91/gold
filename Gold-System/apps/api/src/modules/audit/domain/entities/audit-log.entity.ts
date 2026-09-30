/**
 * Audit Log domain entity.
 *
 * Business rule: BR-S02 — All sensitive operations must be audited.
 * Architecture ref: docs/16-notifications-and-audit.md
 * Decision ref: docs/21-business-decisions.md §6.3
 *
 * IMMUTABILITY GUARANTEE:
 * AuditLog entries are WRITE-ONCE. They are never updated or deleted.
 * Any correction must be achieved by adding a new entry describing the correction.
 */
export class AuditLogEntity {
  readonly id: string;
  readonly actorId: string | null;
  readonly actorType: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly reason: string | null;
  readonly ipAddress: string | null;
  readonly correlationId: string | null;
  readonly timestamp: Date;

  constructor(props: {
    id: string;
    actorId: string | null;
    actorType: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    reason?: string | null;
    ipAddress?: string | null;
    correlationId?: string | null;
    timestamp: Date;
  }) {
    this.id = props.id;
    this.actorId = props.actorId;
    this.actorType = props.actorType;
    this.action = props.action;
    this.entityType = props.entityType;
    this.entityId = props.entityId;
    this.before = props.before ?? null;
    this.after = props.after ?? null;
    this.reason = props.reason ?? null;
    this.ipAddress = props.ipAddress ?? null;
    this.correlationId = props.correlationId ?? null;
    this.timestamp = props.timestamp;
  }
}
