-- Additive Connect catalog/cache and manual mapping tables.
-- No operational pricing, order, trade, purchase, inventory, or ledger tables are changed.

ALTER TABLE "connect_integration_settings"
  ADD COLUMN "catalog_sync_lock_token" TEXT,
  ADD COLUMN "catalog_sync_lock_expires_at" TIMESTAMP(3);

CREATE TYPE "ConnectProductValidationStatus" AS ENUM ('VALID', 'INVALID', 'PARTIAL');
CREATE TYPE "ConnectProductPresenceStatus" AS ENUM ('SEEN', 'NOT_SEEN');
CREATE TYPE "ConnectProductSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'WARNING', 'FAILED');
CREATE TYPE "ConnectPriceSide" AS ENUM ('INTERNAL_BUY', 'INTERNAL_SELL');

CREATE TABLE "connect_product_syncs" (
  "id" TEXT NOT NULL,
  "integration_settings_id" TEXT NOT NULL DEFAULT 'global',
  "status" "ConnectProductSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "total_count" INTEGER NOT NULL DEFAULT 0,
  "valid_count" INTEGER NOT NULL DEFAULT 0,
  "invalid_count" INTEGER NOT NULL DEFAULT 0,
  "new_count" INTEGER NOT NULL DEFAULT 0,
  "updated_count" INTEGER NOT NULL DEFAULT 0,
  "not_seen_count" INTEGER NOT NULL DEFAULT 0,
  "response_time_ms" INTEGER,
  "error_code" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "initiated_by_id" TEXT,
  CONSTRAINT "connect_product_syncs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_products" (
  "id" TEXT NOT NULL,
  "integration_settings_id" TEXT NOT NULL DEFAULT 'global',
  "external_product_id" TEXT NOT NULL,
  "title" TEXT,
  "buy_price" DECIMAL(30,8),
  "sell_price" DECIMAL(30,8),
  "is_active" BOOLEAN,
  "is_buy_active" BOOLEAN,
  "is_sell_active" BOOLEAN,
  "validation_status" "ConnectProductValidationStatus" NOT NULL DEFAULT 'INVALID',
  "presence_status" "ConnectProductPresenceStatus" NOT NULL DEFAULT 'SEEN',
  "last_validation_errors" JSONB,
  "last_fetched_at" TIMESTAMP(3),
  "last_valid_at" TIMESTAMP(3),
  "last_seen_sync_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connect_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "connect_products_buy_price_nonnegative" CHECK ("buy_price" IS NULL OR "buy_price" >= 0),
  CONSTRAINT "connect_products_sell_price_nonnegative" CHECK ("sell_price" IS NULL OR "sell_price" >= 0)
);

CREATE TABLE "connect_product_mappings" (
  "id" TEXT NOT NULL,
  "connect_product_id" TEXT NOT NULL,
  "internal_asset_type" TEXT,
  "internal_gold_purity" DECIMAL(10,6),
  "external_quantity_unit" TEXT,
  "external_price_currency" TEXT,
  "price_unit_basis" TEXT,
  "conversion_factor" DECIMAL(24,10),
  "connect_buy_side" "ConnectPriceSide",
  "connect_sell_side" "ConnectPriceSide",
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "verified_by_id" TEXT,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connect_product_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "connect_product_mappings_purity_range" CHECK ("internal_gold_purity" IS NULL OR ("internal_gold_purity" > 0 AND "internal_gold_purity" <= 1)),
  CONSTRAINT "connect_product_mappings_conversion_positive" CHECK ("conversion_factor" IS NULL OR "conversion_factor" > 0),
  CONSTRAINT "connect_product_mappings_sides_distinct" CHECK ("connect_buy_side" IS NULL OR "connect_sell_side" IS NULL OR "connect_buy_side" <> "connect_sell_side")
);

CREATE UNIQUE INDEX "connect_products_integration_settings_id_external_product_id_key"
  ON "connect_products"("integration_settings_id", "external_product_id");
CREATE INDEX "connect_products_validation_status_presence_status_idx"
  ON "connect_products"("validation_status", "presence_status");
CREATE INDEX "connect_products_is_active_presence_status_idx"
  ON "connect_products"("is_active", "presence_status");
CREATE INDEX "connect_products_title_idx" ON "connect_products"("title");
CREATE INDEX "connect_product_syncs_integration_settings_id_started_at_idx"
  ON "connect_product_syncs"("integration_settings_id", "started_at");
CREATE INDEX "connect_product_syncs_status_started_at_idx"
  ON "connect_product_syncs"("status", "started_at");
CREATE UNIQUE INDEX "connect_product_mappings_connect_product_id_key"
  ON "connect_product_mappings"("connect_product_id");

ALTER TABLE "connect_product_syncs"
  ADD CONSTRAINT "connect_product_syncs_integration_settings_id_fkey"
  FOREIGN KEY ("integration_settings_id") REFERENCES "connect_integration_settings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connect_product_syncs"
  ADD CONSTRAINT "connect_product_syncs_initiated_by_id_fkey"
  FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connect_products"
  ADD CONSTRAINT "connect_products_integration_settings_id_fkey"
  FOREIGN KEY ("integration_settings_id") REFERENCES "connect_integration_settings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connect_products"
  ADD CONSTRAINT "connect_products_last_seen_sync_id_fkey"
  FOREIGN KEY ("last_seen_sync_id") REFERENCES "connect_product_syncs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "connect_product_mappings"
  ADD CONSTRAINT "connect_product_mappings_connect_product_id_fkey"
  FOREIGN KEY ("connect_product_id") REFERENCES "connect_products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "connect_product_mappings"
  ADD CONSTRAINT "connect_product_mappings_verified_by_id_fkey"
  FOREIGN KEY ("verified_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
