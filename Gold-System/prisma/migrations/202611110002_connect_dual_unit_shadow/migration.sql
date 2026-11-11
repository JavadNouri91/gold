ALTER TABLE "connect_product_mappings"
  ADD COLUMN "cash_price_category" TEXT;

ALTER TABLE "connect_integration_settings"
  ADD COLUMN "shadow_display_mode" TEXT NOT NULL DEFAULT 'BOTH',
  ADD COLUMN "shadow_cash_references" JSONB NOT NULL DEFAULT '{}'::jsonb;
