-- Withdrawal requests: direction + destination snapshot on payments

CREATE TYPE "PaymentDirection" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

ALTER TABLE "payments" ADD COLUMN "direction" "PaymentDirection" NOT NULL DEFAULT 'DEPOSIT';
ALTER TABLE "payments" ADD COLUMN "customer_bank_account_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "destination_iban" TEXT;
ALTER TABLE "payments" ADD COLUMN "destination_bank_name" TEXT;
ALTER TABLE "payments" ADD COLUMN "destination_account_holder" TEXT;

CREATE INDEX "payments_direction_idx" ON "payments"("direction");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_customer_bank_account_id_fkey"
  FOREIGN KEY ("customer_bank_account_id") REFERENCES "customer_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
