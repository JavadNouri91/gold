-- ============================================================
-- Phase 3.5 — Assignment + Manual Review Migration
-- docs/21-business-decisions.md §5.1 (approver role)
-- docs/04-actors-and-permissions.md (order.assign, trade.review, trade.approve)
-- UC-09: Assign Order; UC-10: Review Trade
-- architecture/STATE-MACHINES.md: QUOTED→ASSIGNED→UNDER_REVIEW→APPROVED/REJECTED
-- ============================================================

-- ─── 1. AssignmentStatus enum ─────────────────────────────────
-- ACTIVE    = currently assigned; awaiting review decision
-- COMPLETED = review decision reached (approved/rejected/revision requested)
-- CANCELLED = superseded by reassignment or Order cancellation
CREATE TYPE "AssignmentStatus" AS ENUM (
  'ACTIVE',
  'COMPLETED',
  'CANCELLED'
);

-- ─── 2. assignments table ─────────────────────────────────────
-- CUSTOMER VISIBILITY: staff-only; customers MUST NOT see this data
-- REASSIGNMENT: at most one ACTIVE assignment per Order at any time
-- AUDIT: every assignment action creates an AuditLog entry
CREATE TABLE "assignments" (
  "id"              TEXT              NOT NULL,
  "order_id"        TEXT              NOT NULL,
  "quotation_id"    TEXT,             -- optional: most recent active Quotation at time of assignment

  "assigned_to_id"  TEXT              NOT NULL,  -- userId of the reviewer being assigned
  "assigned_by_id"  TEXT              NOT NULL,  -- userId of the operator creating the assignment

  "status"          "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"           TEXT,                        -- optional context/instructions from assignor

  "completed_at"    TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ       NOT NULL,

  CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- Query indexes
CREATE INDEX "assignments_order_id_idx"      ON "assignments"("order_id");
CREATE INDEX "assignments_assigned_to_id_idx" ON "assignments"("assigned_to_id");
CREATE INDEX "assignments_status_idx"        ON "assignments"("status");
CREATE INDEX "assignments_created_at_idx"    ON "assignments"("created_at");

-- ─── 3. Foreign key constraints ──────────────────────────────
ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_order_id_fkey"
    FOREIGN KEY ("order_id")
    REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "assignments_quotation_id_fkey"
    FOREIGN KEY ("quotation_id")
    REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  ADD CONSTRAINT "assignments_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "assignments_assigned_by_id_fkey"
    FOREIGN KEY ("assigned_by_id")
    REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
