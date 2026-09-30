-- ============================================================
-- Phase 3.6 — Trade + Final Confirmation
-- Creates: TradeStatus enum, trades table, trade_items table
-- ============================================================

-- CreateEnum: TradeStatus
CREATE TYPE "TradeStatus" AS ENUM (
  'PENDING_CONFIRMATION',
  'CONFIRMED',
  'SETTLING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'REVERSED'
);

-- CreateTable: trades
-- BR-T01: Trade only created via authorized approval path
-- BR-T02: Financial terms are immutable after CONFIRMED
-- §3.3:   Credit reserved → consumed at confirmation
-- §4.2:   Reversal requires Manager authorization; Financial ledger Phase 4
CREATE TABLE "trades" (
    "id"                       TEXT NOT NULL,
    "trade_number"             TEXT NOT NULL,          -- e.g. TRD-000001 (unique)
    "order_id"                 TEXT NOT NULL,          -- unique: one Trade per Order
    "quotation_id"             TEXT NOT NULL,
    "customer_id"              TEXT NOT NULL,
    "pricing_calculation_id"   TEXT NOT NULL,

    "status"                   "TradeStatus" NOT NULL DEFAULT 'CONFIRMED',

    -- IMMUTABLE commercial terms (snapshot at confirmation)
    "total_amount_rial"        DECIMAL(20,2)  NOT NULL,
    "weight_grams"             DECIMAL(12,6)  NOT NULL,
    "purity_ratio"             DECIMAL(8,6)   NOT NULL,
    "unit_price_rial"          DECIMAL(20,6)  NOT NULL,
    "step1_base_price"         DECIMAL(20,6),
    "wage_amount"              DECIMAL(20,2),
    "profit_amount"            DECIMAL(20,2),   -- null = BLOCKED §13.2
    "tax_amount"               DECIMAL(20,2),   -- null = BLOCKED §13.3
    "discount_amount"          DECIMAL(20,2),
    "rounding_amount"          DECIMAL(20,2),
    "is_complete"              BOOLEAN NOT NULL DEFAULT false,
    "customer_type"            TEXT,

    -- Full locked snapshot (JSON) for Phase 4 reference
    "locked_terms_snapshot"    JSONB NOT NULL,

    -- Confirmation tracking
    "confirmed_by_user_id"     TEXT NOT NULL,
    "confirmed_at"             TIMESTAMPTZ NOT NULL,

    -- Reversal tracking (§4.2) — null until status = REVERSED
    "reversed_by_user_id"      TEXT,
    "reversed_at"              TIMESTAMPTZ,
    "reversal_reason"          TEXT,

    "created_at"               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMPTZ NOT NULL,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable: trade_items
-- Immutable line-item snapshot for a Trade
CREATE TABLE "trade_items" (
    "id"              TEXT NOT NULL,
    "trade_id"        TEXT NOT NULL,

    "weight_grams"    DECIMAL(12,6) NOT NULL,
    "purity_ratio"    DECIMAL(8,6)  NOT NULL,
    "unit_price_rial" DECIMAL(20,6) NOT NULL,
    "total_price_rial" DECIMAL(20,2) NOT NULL,
    "description"     TEXT,

    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_items_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "trades" ADD CONSTRAINT "trades_trade_number_key" UNIQUE ("trade_number");
ALTER TABLE "trades" ADD CONSTRAINT "trades_order_id_key" UNIQUE ("order_id");

-- Indexes on trades
CREATE INDEX "trades_customer_id_idx" ON "trades"("customer_id");
CREATE INDEX "trades_order_id_idx" ON "trades"("order_id");
CREATE INDEX "trades_status_idx" ON "trades"("status");
CREATE INDEX "trades_confirmed_at_idx" ON "trades"("confirmed_at");

-- Indexes on trade_items
CREATE INDEX "trade_items_trade_id_idx" ON "trade_items"("trade_id");

-- Foreign keys: trades
ALTER TABLE "trades" ADD CONSTRAINT "trades_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_quotation_id_fkey"
    FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_pricing_calculation_id_fkey"
    FOREIGN KEY ("pricing_calculation_id") REFERENCES "pricing_calculations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_confirmed_by_user_id_fkey"
    FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trades" ADD CONSTRAINT "trades_reversed_by_user_id_fkey"
    FOREIGN KEY ("reversed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Foreign keys: trade_items
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_trade_id_fkey"
    FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
