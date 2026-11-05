ALTER TABLE "customer_bank_accounts"
  ADD COLUMN "card_last4" TEXT,
  ADD COLUMN "account_last4" TEXT,
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

-- Existing statuses are preserved; only future records use the pending default.
ALTER TABLE "customer_bank_accounts" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE UNIQUE INDEX "customer_bank_accounts_one_default_per_customer"
  ON "customer_bank_accounts" ("customer_id")
  WHERE "is_default" = true;