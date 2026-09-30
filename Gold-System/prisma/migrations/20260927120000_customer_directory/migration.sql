-- Customer directory: operational status separate from KYC status,
-- wider customer types, and staff notes.

CREATE TYPE "CustomerAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

ALTER TYPE "CustomerType" ADD VALUE IF NOT EXISTS 'WHOLESALE';
ALTER TYPE "CustomerType" ADD VALUE IF NOT EXISTS 'CORPORATE';

ALTER TABLE "customers"
  ADD COLUMN "account_status" "CustomerAccountStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "customers"
SET "account_status" = 'INACTIVE'
WHERE "status" IN ('PENDING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED');

UPDATE "customers"
SET "account_status" = 'BLOCKED'
WHERE "status" = 'BLOCKED';

ALTER TABLE "customers"
  ALTER COLUMN "account_status" SET DEFAULT 'INACTIVE';

CREATE INDEX "customers_account_status_idx" ON "customers"("account_status");

CREATE TABLE "customer_notes" (
    "id"          TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "author_id"   TEXT,
    "body"        TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_notes_customer_id_idx" ON "customer_notes"("customer_id");

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_notes"
  ADD CONSTRAINT "customer_notes_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
