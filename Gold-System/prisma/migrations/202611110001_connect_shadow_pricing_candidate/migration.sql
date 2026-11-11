ALTER TABLE "connect_integration_settings"
  ADD COLUMN "shadow_reference_product_id" TEXT,
  ADD COLUMN "shadow_reference_mapping_id" TEXT,
  ADD COLUMN "shadow_reference_mapping_updated_at" TIMESTAMP(3),
  ADD COLUMN "shadow_reference_price_field" TEXT,
  ADD COLUMN "shadow_price_max_age_seconds" INTEGER NOT NULL DEFAULT 300;
