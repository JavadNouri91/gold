-- Customer-type BUY/SELL transaction fees (separate from wage/اجرت)

CREATE TYPE "TradeSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "FeeMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');
CREATE TYPE "FeeCalculationBase" AS ENUM ('GOLD_VALUE_STEP4', 'AFTER_GROUP_RULE_STEP5', 'GOLD_COMMERCIAL_TOTAL');
CREATE TYPE "FeeChargeCode" AS ENUM ('TRANSACTION_FEE');

CREATE TABLE "customer_type_fee_policies" (
    "id" TEXT NOT NULL,
    "customer_type" "CustomerType",
    "side" "TradeSide" NOT NULL,
    "code" "FeeChargeCode" NOT NULL DEFAULT 'TRANSACTION_FEE',
    "label_fa" TEXT NOT NULL DEFAULT 'کارمزد معامله',
    "mode" "FeeMode" NOT NULL DEFAULT 'NONE',
    "value" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "calculation_base" "FeeCalculationBase",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active_from" TIMESTAMP(3) NOT NULL,
    "active_to" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_type_fee_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "transaction_charge_snapshots" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "code" "FeeChargeCode" NOT NULL DEFAULT 'TRANSACTION_FEE',
    "label_fa" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "mode" "FeeMode" NOT NULL,
    "rate_value" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "calculation_base" "FeeCalculationBase",
    "base_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(20,2) NOT NULL,
    "policy_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_charge_snapshots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD COLUMN "gold_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "fee_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;

ALTER TABLE "quotations" ADD COLUMN "gold_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE "quotations" ADD COLUMN "fee_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;

ALTER TABLE "trades" ADD COLUMN "gold_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;
ALTER TABLE "trades" ADD COLUMN "fee_amount_rial" DECIMAL(20,2) NOT NULL DEFAULT 0;

-- Backfill: existing totals are gold-only (no fees)
UPDATE "orders" SET "gold_amount_rial" = "total_amount_rial", "fee_amount_rial" = 0;
UPDATE "quotations" SET "gold_amount_rial" = "total_amount_rial", "fee_amount_rial" = 0;
UPDATE "trades" SET "gold_amount_rial" = "total_amount_rial", "fee_amount_rial" = 0;

CREATE INDEX "customer_type_fee_policies_customer_type_side_idx" ON "customer_type_fee_policies"("customer_type", "side");
CREATE INDEX "customer_type_fee_policies_status_idx" ON "customer_type_fee_policies"("status");
CREATE INDEX "customer_type_fee_policies_active_from_idx" ON "customer_type_fee_policies"("active_from");
CREATE INDEX "transaction_charge_snapshots_order_id_idx" ON "transaction_charge_snapshots"("order_id");

ALTER TABLE "customer_type_fee_policies" ADD CONSTRAINT "customer_type_fee_policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transaction_charge_snapshots" ADD CONSTRAINT "transaction_charge_snapshots_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
