-- Phase 6: Supplier + SupplierAccount + Purchase + PurchaseItem
-- docs/21-business-decisions.md §8.4, §11.2
-- docs/09-domain-model.md (UpstreamProvider, SupplierAccount, Purchase)
-- architecture/STATE-MACHINES.md (Purchase state machine)
--
-- Purchase state machine (MVP scope):
--   DRAFT → CONFIRMED
--   SETTLING / SETTLED: DEFERRED §8.4
--   CANCELLED: cancellation before confirmation
--
-- Financial Ledger (when Purchase CONFIRMED):
--   DR FA-08 (Purchase Cost — Expense) : totalAmountRial
--   CR FA-03 (Supplier Payable — Liability) : totalAmountRial
--   Source: docs/14-accounting.md ("supplier payable/cash impact"),
--           docs/21-business-decisions.md §6.1
--
-- Gold Ledger: BLOCKED — open-questions.md #22 and #39 OPEN
--   GA-01 (Store Gold Position) IN posting rules are not documented.
--
-- All monetary fields: DECIMAL(20,2) — BR-P05 (never Float)
-- All weight fields: DECIMAL(20,6)
-- Idempotency: unique constraint on purchases.idempotency_key

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE "SupplierStatus" AS ENUM (
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE'
);

CREATE TYPE "SupplierIntegrationMode" AS ENUM (
  'MANUAL',
  'API_FUTURE'
);

CREATE TYPE "PurchaseStatus" AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'SETTLING',
  'SETTLED',
  'CANCELLED'
);

CREATE TYPE "PurchaseSettlementType" AS ENUM (
  'RIAL',
  'GOLD'
);

-- ─── SUPPLIERS ────────────────────────────────────────────────────────────────

CREATE TABLE "suppliers" (
  "id"                TEXT NOT NULL,
  "supplier_number"   TEXT NOT NULL,
  "name"              TEXT NOT NULL,
  "contact_name"      TEXT,
  "contact_phone"     TEXT,
  "contact_email"     TEXT,
  "integration_mode"  "SupplierIntegrationMode" NOT NULL DEFAULT 'MANUAL',
  "status"            "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes"             TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_supplier_number_key" ON "suppliers"("supplier_number");
CREATE INDEX "suppliers_status_idx" ON "suppliers"("status");

-- ─── SUPPLIER ACCOUNTS ────────────────────────────────────────────────────────

CREATE TABLE "supplier_accounts" (
  "id"                    TEXT NOT NULL,
  "supplier_id"           TEXT NOT NULL,
  "status"                TEXT NOT NULL DEFAULT 'ACTIVE',
  "total_purchased_rial"  DECIMAL(20,2) NOT NULL DEFAULT 0,
  "total_paid_rial"       DECIMAL(20,2) NOT NULL DEFAULT 0,
  "notes"                 TEXT,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supplier_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_accounts_supplier_id_key" ON "supplier_accounts"("supplier_id");

ALTER TABLE "supplier_accounts" ADD CONSTRAINT "supplier_accounts_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── PURCHASES ────────────────────────────────────────────────────────────────

CREATE TABLE "purchases" (
  "id"                   TEXT NOT NULL,
  "purchase_number"      TEXT NOT NULL,
  "idempotency_key"      TEXT NOT NULL,
  "supplier_id"          TEXT NOT NULL,
  "status"               "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
  "settlement_type"      "PurchaseSettlementType" NOT NULL,
  "purchase_date"        TIMESTAMP(3) NOT NULL,
  "total_amount_rial"    DECIMAL(20,2) NOT NULL,
  "weight_grams"         DECIMAL(20,6) NOT NULL,
  "purity_ratio"         DECIMAL(10,6) NOT NULL,
  "price_per_gram_rial"  DECIMAL(20,6) NOT NULL,
  "supplier_reference"   TEXT,
  "notes"                TEXT,
  "recorded_by_user_id"  TEXT,
  "confirmed_by_user_id" TEXT,
  "confirmed_at"         TIMESTAMP(3),
  "cancelled_by_user_id" TEXT,
  "cancelled_at"         TIMESTAMP(3),
  "cancellation_reason"  TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchases_purchase_number_key"  ON "purchases"("purchase_number");
CREATE UNIQUE INDEX "purchases_idempotency_key_key"  ON "purchases"("idempotency_key");
CREATE INDEX "purchases_supplier_id_idx"             ON "purchases"("supplier_id");
CREATE INDEX "purchases_status_idx"                  ON "purchases"("status");
CREATE INDEX "purchases_purchase_date_idx"           ON "purchases"("purchase_date");
CREATE INDEX "purchases_created_at_idx"              ON "purchases"("created_at");

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey"
  FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_confirmed_by_user_id_fkey"
  FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── PURCHASE ITEMS ───────────────────────────────────────────────────────────

CREATE TABLE "purchase_items" (
  "id"                   TEXT NOT NULL,
  "purchase_id"          TEXT NOT NULL,
  "weight_grams"         DECIMAL(20,6) NOT NULL,
  "purity_ratio"         DECIMAL(10,6) NOT NULL,
  "price_per_gram_rial"  DECIMAL(20,6) NOT NULL,
  "total_amount_rial"    DECIMAL(20,2) NOT NULL,
  "description"          TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
