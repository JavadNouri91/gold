-- CreateTable
CREATE TABLE "customer_bank_accounts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bank_code" TEXT,
    "bank_name" TEXT,
    "account_holder" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_bank_accounts_customer_id_idx" ON "customer_bank_accounts"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_bank_accounts_customer_id_iban_key" ON "customer_bank_accounts"("customer_id", "iban");

-- AddForeignKey
ALTER TABLE "customer_bank_accounts" ADD CONSTRAINT "customer_bank_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
