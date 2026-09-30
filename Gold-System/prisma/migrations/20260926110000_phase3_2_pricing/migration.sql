-- ============================================================
-- Phase 3.2: Pricing Engine
-- Source of truth: docs/21-business-decisions.md §1
-- docs/12-pricing-engine.md, docs/15-api-integrations.md
-- ============================================================

-- CreateEnum: Pricing-specific enums
CREATE TYPE "AdjustmentMode" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "AdjustmentDirection" AS ENUM ('INCREASE', 'DECREASE');
CREATE TYPE "PriceSnapshotStatus" AS ENUM ('VALID', 'STALE', 'INVALID');
CREATE TYPE "WageMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');
CREATE TYPE "DiscountMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');
CREATE TYPE "RoundingMethod" AS ENUM ('NONE', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST');
CREATE TYPE "GroupAdjMode" AS ENUM ('NONE', 'PERCENTAGE');

-- CreateTable: price_sources
CREATE TABLE "price_sources" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "provider_type" TEXT NOT NULL,
    "config"        JSONB,
    "status"        TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable: price_snapshots
CREATE TABLE "price_snapshots" (
    "id"               TEXT NOT NULL,
    "source_id"        TEXT NOT NULL,
    "raw_value"        DECIMAL(20,6) NOT NULL,
    "normalized_value" DECIMAL(20,6) NOT NULL,
    "unit"             TEXT NOT NULL,
    "currency"         TEXT NOT NULL DEFAULT 'IRR',
    "purity_reference" TEXT,
    "external_ref"     TEXT,
    "metadata"         JSONB,
    "captured_at"      TIMESTAMP(3) NOT NULL,
    "validity_status"  "PriceSnapshotStatus" NOT NULL DEFAULT 'VALID',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: price_adjustments
CREATE TABLE "price_adjustments" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "mode"           "AdjustmentMode" NOT NULL,
    "direction"      "AdjustmentDirection" NOT NULL,
    "value"          DECIMAL(20,6) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to"   TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by"     TEXT,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pricing_rules
CREATE TABLE "pricing_rules" (
    "id"                TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "customer_type"     "CustomerType",
    "group_adj_mode"    "GroupAdjMode" NOT NULL DEFAULT 'NONE',
    "group_adj_value"   DECIMAL(10,6) NOT NULL DEFAULT 0,
    "group_adj_direction" "AdjustmentDirection" NOT NULL DEFAULT 'INCREASE',
    "wage_mode"         "WageMode" NOT NULL DEFAULT 'NONE',
    "wage_value"        DECIMAL(20,6) NOT NULL DEFAULT 0,
    "discount_mode"     "DiscountMode" NOT NULL DEFAULT 'NONE',
    "discount_value"    DECIMAL(20,6) NOT NULL DEFAULT 0,
    "rounding_method"   "RoundingMethod" NOT NULL DEFAULT 'NONE',
    "rounding_precision" DECIMAL(20,2) NOT NULL DEFAULT 1,
    "priority"          INTEGER NOT NULL DEFAULT 0,
    "active_from"       TIMESTAMP(3) NOT NULL,
    "active_to"         TIMESTAMP(3),
    "status"            TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by"        TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pricing_calculations
CREATE TABLE "pricing_calculations" (
    "id"                      TEXT NOT NULL,
    "reference_type"          TEXT,
    "reference_id"            TEXT,
    "price_snapshot_id"       TEXT NOT NULL,
    "global_adj_id"           TEXT,
    "pricing_rule_id"         TEXT,
    "weight_grams"            DECIMAL(20,6) NOT NULL,
    "purity_ratio"            DECIMAL(10,6) NOT NULL,
    "customer_type"           TEXT,
    "input_discount_amount"   DECIMAL(20,2) NOT NULL DEFAULT 0,
    "step1_base_price"        DECIMAL(20,6) NOT NULL,
    "step2_after_global_adj"  DECIMAL(20,6) NOT NULL,
    "step3_purity_conv_applied" BOOLEAN NOT NULL DEFAULT false,
    "step4_after_weight"      DECIMAL(20,2) NOT NULL,
    "step5_after_group_rule"  DECIMAL(20,2) NOT NULL,
    "wage_amount"             DECIMAL(20,2) NOT NULL DEFAULT 0,
    "profit_amount"           DECIMAL(20,2),
    "tax_amount"              DECIMAL(20,2),
    "discount_amount"         DECIMAL(20,2) NOT NULL DEFAULT 0,
    "price_before_rounding"   DECIMAL(20,2) NOT NULL,
    "rounding_amount"         DECIMAL(20,2) NOT NULL DEFAULT 0,
    "final_price"             DECIMAL(20,2) NOT NULL,
    "is_complete"             BOOLEAN NOT NULL DEFAULT false,
    "blocked_steps"           JSONB,
    "calculated_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculation_version"     TEXT NOT NULL DEFAULT '1',

    CONSTRAINT "pricing_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "price_sources_name_key" ON "price_sources"("name");

-- CreateIndex
CREATE INDEX "price_sources_status_idx" ON "price_sources"("status");
CREATE INDEX "price_snapshots_source_id_idx" ON "price_snapshots"("source_id");
CREATE INDEX "price_snapshots_captured_at_idx" ON "price_snapshots"("captured_at" DESC);
CREATE INDEX "price_snapshots_validity_status_idx" ON "price_snapshots"("validity_status");
CREATE INDEX "price_adjustments_status_idx" ON "price_adjustments"("status");
CREATE INDEX "price_adjustments_effective_from_idx" ON "price_adjustments"("effective_from");
CREATE INDEX "pricing_rules_customer_type_idx" ON "pricing_rules"("customer_type");
CREATE INDEX "pricing_rules_status_idx" ON "pricing_rules"("status");
CREATE INDEX "pricing_rules_active_from_idx" ON "pricing_rules"("active_from");
CREATE INDEX "pricing_calculations_reference_type_reference_id_idx" ON "pricing_calculations"("reference_type", "reference_id");
CREATE INDEX "pricing_calculations_price_snapshot_id_idx" ON "pricing_calculations"("price_snapshot_id");
CREATE INDEX "pricing_calculations_calculated_at_idx" ON "pricing_calculations"("calculated_at");

-- AddForeignKey
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_source_id_fkey"
    FOREIGN KEY ("source_id") REFERENCES "price_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "price_adjustments" ADD CONSTRAINT "price_adjustments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pricing_rules" ADD CONSTRAINT "pricing_rules_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pricing_calculations" ADD CONSTRAINT "pricing_calculations_price_snapshot_id_fkey"
    FOREIGN KEY ("price_snapshot_id") REFERENCES "price_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pricing_calculations" ADD CONSTRAINT "pricing_calculations_global_adj_id_fkey"
    FOREIGN KEY ("global_adj_id") REFERENCES "price_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pricing_calculations" ADD CONSTRAINT "pricing_calculations_pricing_rule_id_fkey"
    FOREIGN KEY ("pricing_rule_id") REFERENCES "pricing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
