-- ============================================================
-- Phase 3.4 — Quotation Vertical Slice Migration
-- docs/21-business-decisions.md §2.1, §2.2, §2.3
-- architecture/STATE-MACHINES.md (Quotation state machine)
-- UC-08: automatic Quotation generation after Order submission
-- ============================================================

-- ─── 1. QuotationStatus enum ──────────────────────────────────
-- State machine: ACTIVE → EXPIRED | REVISED | CONVERTED
-- No time-based expiry — §2.3
-- EXPIRED only when associated Order is cancelled
CREATE TYPE "QuotationStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REVISED',
  'CONVERTED'
);

-- ─── 2. quotations table ──────────────────────────────────────
-- IMMUTABILITY:
--   Financial values are set at creation and NEVER updated.
--   Price is locked at Order submission (§2.1).
--   Changes in gold price do NOT affect existing quotations (§2.2).
CREATE TABLE "quotations" (
  "id"                      TEXT            NOT NULL,
  "quotation_number"        TEXT            NOT NULL,
  "order_id"                TEXT            NOT NULL,
  "customer_id"             TEXT            NOT NULL,
  "pricing_calculation_id"  TEXT            NOT NULL,
  "version"                 INTEGER         NOT NULL DEFAULT 1,
  "status"                  "QuotationStatus" NOT NULL DEFAULT 'ACTIVE',

  -- Financial snapshot (BR-P03) — Decimal, never Float
  "total_amount_rial"       DECIMAL(20,2)   NOT NULL,
  "weight_grams"            DECIMAL(12,6)   NOT NULL,
  "purity_ratio"            DECIMAL(8,6)    NOT NULL,

  -- Pipeline output snapshots (for document display)
  "step1_base_price"        DECIMAL(20,6),
  "wage_amount"             DECIMAL(20,2),
  "discount_amount"         DECIMAL(20,2),
  "rounding_amount"         DECIMAL(20,2),

  -- Completeness flag (false while profit/tax BLOCKED §13.2/§13.3)
  "is_complete"             BOOLEAN         NOT NULL DEFAULT false,

  -- Document reference (S3/MinIO) — null until generation succeeds
  "document_key"            TEXT,
  "document_mime_type"      TEXT,
  "document_generated_at"   TIMESTAMPTZ,

  "generated_at"            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  "created_at"              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ     NOT NULL,

  CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "quotations_quotation_number_key" ON "quotations"("quotation_number");
-- Prevents duplicate versions for the same order
CREATE UNIQUE INDEX "quotations_order_id_version_key" ON "quotations"("order_id", "version");

-- Query indexes
CREATE INDEX "quotations_customer_id_idx"  ON "quotations"("customer_id");
CREATE INDEX "quotations_order_id_idx"     ON "quotations"("order_id");
CREATE INDEX "quotations_status_idx"       ON "quotations"("status");
CREATE INDEX "quotations_generated_at_idx" ON "quotations"("generated_at");

-- ─── 3. quotation_items table ─────────────────────────────────
CREATE TABLE "quotation_items" (
  "id"              TEXT          NOT NULL,
  "quotation_id"    TEXT          NOT NULL,

  -- Gold parameters — Decimal, never Float
  "weight_grams"    DECIMAL(12,6) NOT NULL,
  "purity_ratio"    DECIMAL(8,6)  NOT NULL,

  -- Pricing snapshot
  "unit_price_rial" DECIMAL(20,6) NOT NULL,
  "total_price_rial" DECIMAL(20,2) NOT NULL,

  "description"     TEXT,
  "created_at"      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quotation_items_quotation_id_idx" ON "quotation_items"("quotation_id");

-- ─── 4. Foreign key constraints ──────────────────────────────
ALTER TABLE "quotations"
  ADD CONSTRAINT "quotations_order_id_fkey"
    FOREIGN KEY ("order_id")
    REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "quotations_customer_id_fkey"
    FOREIGN KEY ("customer_id")
    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  ADD CONSTRAINT "quotations_pricing_calculation_id_fkey"
    FOREIGN KEY ("pricing_calculation_id")
    REFERENCES "pricing_calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotation_items"
  ADD CONSTRAINT "quotation_items_quotation_id_fkey"
    FOREIGN KEY ("quotation_id")
    REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
