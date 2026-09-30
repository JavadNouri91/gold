import { AssignmentStatus } from '@gold/shared-types';

/**
 * Assignment domain entity.
 *
 * STATE MACHINE:
 *   ACTIVE → COMPLETED  (review decision: approve/reject/requestRevision)
 *   ACTIVE → CANCELLED  (reassignment: Operator creates a new Assignment for same Order)
 *
 * CUSTOMER VISIBILITY:
 *   Assignment records are staff-only. Customers MUST NOT see internal
 *   assignment data, assignee identity, or reviewer notes.
 *   Enforced at presentation layer (not exposed in customer-facing DTOs).
 *
 * UNIQUE INVARIANT:
 *   At most ONE ACTIVE Assignment per Order at any point in time.
 *   Enforced by AssignmentsService (cancel existing before creating new).
 *
 * docs/05-use-cases.md UC-09, UC-10
 * docs/04-actors-and-permissions.md: order.assign, trade.review, trade.approve
 */
export class AssignmentEntity {
  readonly id: string;

  readonly orderId: string;
  readonly quotationId: string | null; // most recent active Quotation at assignment time

  readonly assignedToId: string; // userId of the reviewer being assigned
  readonly assignedById: string; // userId of the operator creating the assignment

  status: AssignmentStatus;

  readonly notes: string | null;

  readonly completedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: {
    id: string;
    orderId: string;
    quotationId: string | null;
    assignedToId: string;
    assignedById: string;
    status: AssignmentStatus;
    notes: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    Object.assign(this, props);
  }

  // ─── State machine guards ─────────────────────────────────────

  /** True if the assignment can be completed (review decision made) */
  canComplete(): boolean {
    return this.status === AssignmentStatus.ACTIVE;
  }

  /** True if the assignment can be cancelled (superseded by reassignment) */
  canCancel(): boolean {
    return this.status === AssignmentStatus.ACTIVE;
  }

  /** True if the assignment is currently active */
  isActive(): boolean {
    return this.status === AssignmentStatus.ACTIVE;
  }
}
