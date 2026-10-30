-- Immutable conversion-fee snapshot per pickup + document columns

CREATE TYPE "PickupChargeStatus" AS ENUM ('NONE', 'RESERVED', 'SETTLED', 'RELEASED');

CREATE TABLE "pickup_charge_snapshots" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "code" "FeeChargeCode" NOT NULL DEFAULT 'PICKUP_CONVERSION_FEE',
    "label_fa" TEXT NOT NULL,
    "mode" "FeeMode" NOT NULL DEFAULT 'NONE',
    "rate_value" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "calculation_base" "FeeCalculationBase",
    "base_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "gold_price_per_gram_rial" DECIMAL(20,2),
    "policy_id" TEXT,
    "status" "PickupChargeStatus" NOT NULL DEFAULT 'NONE',
    "wallet_available_after_rial" DECIMAL(20,2),
    "reserved_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pickup_charge_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pickup_charge_snapshots_pickup_id_key" ON "pickup_charge_snapshots"("pickup_id");

ALTER TABLE "physical_gold_pickups" ADD COLUMN "pre_invoice_key" TEXT;
ALTER TABLE "physical_gold_pickups" ADD COLUMN "pre_invoice_mime_type" TEXT;
ALTER TABLE "physical_gold_pickups" ADD COLUMN "pre_invoice_generated_at" TIMESTAMP(3);
ALTER TABLE "physical_gold_pickups" ADD COLUMN "invoice_key" TEXT;
ALTER TABLE "physical_gold_pickups" ADD COLUMN "invoice_mime_type" TEXT;
ALTER TABLE "physical_gold_pickups" ADD COLUMN "invoice_generated_at" TIMESTAMP(3);

ALTER TABLE "pickup_charge_snapshots"
  ADD CONSTRAINT "pickup_charge_snapshots_pickup_id_fkey"
  FOREIGN KEY ("pickup_id") REFERENCES "physical_gold_pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
