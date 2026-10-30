-- Melted → physical conversion fee: side enum + fee base/code enum values

CREATE TYPE "FeeChargeSide" AS ENUM ('BUY', 'SELL', 'PICKUP');

ALTER TYPE "FeeCalculationBase" ADD VALUE IF NOT EXISTS 'PICKUP_GOLD_VALUE';
ALTER TYPE "FeeChargeCode" ADD VALUE IF NOT EXISTS 'PICKUP_CONVERSION_FEE';

ALTER TABLE "customer_type_fee_policies"
  ALTER COLUMN "side" TYPE "FeeChargeSide" USING ("side"::text::"FeeChargeSide");
