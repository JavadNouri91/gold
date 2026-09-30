-- ============================================================
-- Phase 3.3 — Order + Credit Reservation Migration
-- docs/21-business-decisions.md §3.3, §3.4, §3.5, §4.1
-- architecture/STATE-MACHINES.md (Order state machine)
-- ============================================================

-- ─── 1. Add RESERVATION to CreditTransactionType enum ────────
-- Adding an enum value in PostgreSQL is safe (non-destructive).
-- RESERVATION = credit blocked at Order submission (§3.3)
ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS 'RESERVATION';

-- ─── 2. Create OrderStatus enum ──────────────────────────────
-- Full lifecycle from architecture/STATE-MACHINES.md
-- Phase 3.3 scope: DRAFT, SUBMITTED, CANCELLED, REJECTED (prep)
CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'QUOTED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'REVISION_REQUESTED',
  'REJECTED',
  'APPROVED',
  'TRADE_CREATED',
  'SETTLING',
  'COMPLETED',
  'CANCELLED'
);

-- ─── 3. Add allow_customer_cancellation to stores ─────────────
-- docs/21-business-decisions.md §4.1
-- true  = customer may cancel before Trade confirmation (default)
-- false = cancellation requires Operator/Manager action
ALTER TABLE "stores"
  ADD COLUMN "allow_customer_cancellation" BOOLEAN NOT NULL DEFAULT true;

-- ─── 4. Create orders table ───────────────────────────────────
CREATE TABLE "orders" (
  "id"                      TEXT          NOT NULL,
  "order_number"            TEXT          NOT NULL,
  "customer_id"             TEXT          NOT NULL,
  "customer_account_id"     TEXT          NOT NULL,
  "pricing_calculation_id"  TEXT,
  "status"                  "OrderStatus" NOT NULL DEFAULT 'DRAFT',

  -- Rial total from PricingEngineResult.finalPrice — never Float (BR-P05)
  "total_amount_rial"       DECIMAL(20,2) NOT NULL,

  -- Credit reserved at SUBMITTED; released at CANCELLED/REJECTED — §3.3
  "reserved_amount_rial"    DECIMAL(20,2) NOT NULL DEFAULT 0,

  -- Gold order parameters (snapshot at creation)
  "weight_grams"            DECIMAL(12,6) NOT NULL,
  "purity_ratio"            DECIMAL(8,6)  NOT NULL,
  "customer_type"           "CustomerType",

  -- Lifecycle timestamps
  "submitted_at"            TIMESTAMPTZ,
  "cancelled_at"            TIMESTAMPTZ,
  "rejected_at"             TIMESTAMPTZ,

  -- Cancellation tracking — §4.1
  "cancellation_reason"     TEXT,
  "cancelled_by_user_id"    TEXT,

  -- Rejection tracking
  "rejection_reason"        TEXT,
  "rejected_by_user_id"     TEXT,

  "created_at"              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ   NOT NULL,

  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "orders_order_number_key"            ON "orders"("order_number");
CREATE UNIQUE INDEX "orders_pricing_calculation_id_key"  ON "orders"("pricing_calculation_id");

-- Query indexes
CREATE INDEX "orders_customer_id_idx"         ON "orders"("customer_id");
CREATE INDEX "orders_customer_account_id_idx" ON "orders"("customer_account_id");
CREATE INDEX "orders_status_idx"              ON "orders"("status");
CREATE INDEX "orders_created_at_idx"          ON "orders"("created_at");

-- ─── 5. Create order_items table ──────────────────────────────
CREATE TABLE "order_items" (
  "id"              TEXT          NOT NULL,
  "order_id"        TEXT          NOT NULL,

  -- Gold parameters for this line item
  "weight_grams"    DECIMAL(12,6) NOT NULL,
  "purity_ratio"    DECIMAL(8,6)  NOT NULL,

  -- Pricing snapshot (from PricingEngineResult)
  "unit_price_rial" DECIMAL(20,6) NOT NULL,   -- price per gram
  "total_price_rial" DECIMAL(20,2) NOT NULL,  -- unit_price × weight_grams

  "description"     TEXT,
  "metadata"        JSONB,
  "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- ─── 6. Foreign key constraints ──────────────────────────────
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "orders_customer_account_id_fkey"
    FOREIGN KEY ("customer_account_id")
    REFERENCES "customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "orders_pricing_calculation_id_fkey"
    FOREIGN KEY ("pricing_calculation_id")
    REFERENCES "pricing_calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "orders_cancelled_by_user_id_fkey"
    FOREIGN KEY ("cancelled_by_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  ADD CONSTRAINT "orders_rejected_by_user_id_fkey"
    FOREIGN KEY ("rejected_by_user_id")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_order_id_fkey"
    FOREIGN KEY ("order_id")
    REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
