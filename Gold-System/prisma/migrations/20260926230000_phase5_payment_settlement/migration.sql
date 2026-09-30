-- Phase 5: Payment + PaymentAllocation + Settlement
-- docs/21-business-decisions.md §8, §9
-- architecture/STATE-MACHINES.md (Payment state machine)
--
-- Payment state machine: PENDING → VALIDATED → ALLOCATED → COMPLETED
-- Exceptional: FAILED | REVERSED
--
-- Settlement: PENDING → SETTLED (triggered at 100% allocation §8.1)
-- No installments (§8.2) — full payment required.
-- No payment deadline (§8.3) — managed manually by Accountant.
--
-- All monetary fields: DECIMAL(20,2) — BR-P05 (never Float)
-- Idempotency: unique constraint on payments.idempotency_key
--
-- LEDGER POSTING: BLOCKED
--   Payment DR/CR journal entry rules are not documented in §6.
--   Pending business clarification of which accounts get debited/credited
--   for each payment method (FA-04/FA-05 vs FA-12).

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE "PaymentMethod" AS ENUM (
  'BANK_TRANSFER',
  'CARD_TO_CARD',
  'CASH'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'PENDING',
  'VALIDATED',
  'ALLOCATED',
  'COMPLETED',
  'FAILED',
  'REVERSED'
);

CREATE TYPE "SettlementStatus" AS ENUM (
  'PENDING',
  'SETTLED'
);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────

CREATE TABLE "payments" (
  "id"                     TEXT NOT NULL,
  "idempotency_key"        TEXT NOT NULL,
  "trade_id"               TEXT NOT NULL,
  "customer_id"            TEXT NOT NULL,
  "method"                 "PaymentMethod" NOT NULL,
  "amount"                 DECIMAL(20,2) NOT NULL,
  "currency"               TEXT NOT NULL DEFAULT 'IRR',
  "status"                 "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "reference_number"       TEXT,
  "notes"                  TEXT,
  "received_at"            TIMESTAMP(3),
  "recorded_by_user_id"    TEXT,
  "validated_at"           TIMESTAMP(3),
  "validated_by_user_id"   TEXT,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- Idempotency: exactly one payment per submission key
CREATE UNIQUE INDEX "payments_idempotency_key_key"
  ON "payments"("idempotency_key");

-- Lookup indexes
CREATE INDEX "payments_trade_id_idx"    ON "payments"("trade_id");
CREATE INDEX "payments_customer_id_idx" ON "payments"("customer_id");
CREATE INDEX "payments_status_idx"      ON "payments"("status");
CREATE INDEX "payments_created_at_idx"  ON "payments"("created_at");

-- Foreign keys
ALTER TABLE "payments" ADD CONSTRAINT "payments_trade_id_fkey"
  FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_validated_by_user_id_fkey"
  FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── PAYMENT ALLOCATIONS ─────────────────────────────────────────────────────

CREATE TABLE "payment_allocations" (
  "id"                    TEXT NOT NULL,
  "payment_id"            TEXT NOT NULL,
  "trade_id"              TEXT NOT NULL,
  "amount"                DECIMAL(20,2) NOT NULL,
  "allocated_by_user_id"  TEXT,
  "allocated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- One allocation per payment per trade
CREATE UNIQUE INDEX "payment_allocations_payment_id_trade_id_key"
  ON "payment_allocations"("payment_id", "trade_id");

-- Lookup indexes
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE INDEX "payment_allocations_trade_id_idx"   ON "payment_allocations"("trade_id");

-- Foreign keys
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_trade_id_fkey"
  FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocated_by_user_id_fkey"
  FOREIGN KEY ("allocated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── SETTLEMENTS ─────────────────────────────────────────────────────────────

CREATE TABLE "settlements" (
  "id"                   TEXT NOT NULL,
  "trade_id"             TEXT NOT NULL,
  "status"               "SettlementStatus" NOT NULL DEFAULT 'PENDING',
  "settled_amount"       DECIMAL(20,2) NOT NULL DEFAULT 0,
  "settled_at"           TIMESTAMP(3),
  "settled_by_user_id"   TEXT,
  "notes"                TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- One settlement record per trade
CREATE UNIQUE INDEX "settlements_trade_id_key" ON "settlements"("trade_id");

-- Lookup index
CREATE INDEX "settlements_status_idx" ON "settlements"("status");

-- Foreign keys
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trade_id_fkey"
  FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_settled_by_user_id_fkey"
  FOREIGN KEY ("settled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
