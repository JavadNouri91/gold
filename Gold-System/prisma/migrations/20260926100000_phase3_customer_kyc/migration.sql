-- ============================================================
-- Phase 3: Customer & KYC Vertical Slice
-- Source of truth: docs/21-business-decisions.md
-- ============================================================

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('GRANT', 'INCREASE', 'DECREASE', 'CONSUME', 'RELEASE', 'EXPIRE', 'ADJUSTMENT', 'REVERSAL');

-- CreateTable: customers
CREATE TABLE "customers" (
    "id"               TEXT NOT NULL,
    "customer_number"  TEXT NOT NULL,
    "user_id"          TEXT,
    "first_name"       TEXT NOT NULL,
    "last_name"        TEXT NOT NULL,
    "national_id"      TEXT NOT NULL,
    "mobile"           TEXT NOT NULL,
    "email"            TEXT,
    "date_of_birth"    TIMESTAMP(3),
    "address"          TEXT,
    "type"             "CustomerType",
    "status"           "CustomerStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable: customer_documents
CREATE TABLE "customer_documents" (
    "id"               TEXT NOT NULL,
    "customer_id"      TEXT NOT NULL,
    "document_type"    TEXT NOT NULL,
    "file_key"         TEXT NOT NULL,
    "file_name"        TEXT NOT NULL,
    "file_mime_type"   TEXT NOT NULL,
    "file_size_bytes"  INTEGER NOT NULL,
    "status"           "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by"      TEXT,
    "reviewed_at"      TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable: kyc_verifications
CREATE TABLE "kyc_verifications" (
    "id"              TEXT NOT NULL,
    "customer_id"     TEXT NOT NULL,
    "status"          "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_id"     TEXT,
    "decision_reason" TEXT,
    "reviewed_at"     TIMESTAMP(3),
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kyc_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: customer_accounts
CREATE TABLE "customer_accounts" (
    "id"                        TEXT NOT NULL,
    "customer_id"               TEXT NOT NULL,
    "status"                    TEXT NOT NULL DEFAULT 'ACTIVE',
    "credit_limit_rial"         DECIMAL(20,2) NOT NULL DEFAULT 0,
    "reserved_credit_rial"      DECIMAL(20,2) NOT NULL DEFAULT 0,
    "consumed_credit_rial"      DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit_limit_gold_rial"    DECIMAL(20,2) NOT NULL DEFAULT 0,
    "reserved_credit_gold_rial" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "consumed_credit_gold_rial" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: credit_transactions
CREATE TABLE "credit_transactions" (
    "id"           TEXT NOT NULL,
    "account_id"   TEXT NOT NULL,
    "type"         "CreditTransactionType" NOT NULL,
    "credit_pool"  TEXT NOT NULL,
    "amount"       DECIMAL(20,2) NOT NULL,
    "balance_after" DECIMAL(20,2) NOT NULL,
    "source_type"  TEXT,
    "source_id"    TEXT,
    "reason"       TEXT,
    "created_by"   TEXT,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "customers_customer_number_key" ON "customers"("customer_number");
CREATE UNIQUE INDEX "customers_user_id_key" ON "customers"("user_id");
CREATE UNIQUE INDEX "customers_national_id_key" ON "customers"("national_id");
CREATE UNIQUE INDEX "customers_mobile_key" ON "customers"("mobile");
CREATE UNIQUE INDEX "customer_accounts_customer_id_key" ON "customer_accounts"("customer_id");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");
CREATE INDEX "customers_mobile_idx" ON "customers"("mobile");
CREATE INDEX "customers_national_id_idx" ON "customers"("national_id");
CREATE INDEX "customers_customer_number_idx" ON "customers"("customer_number");
CREATE INDEX "customer_documents_customer_id_idx" ON "customer_documents"("customer_id");
CREATE INDEX "customer_documents_status_idx" ON "customer_documents"("status");
CREATE INDEX "customer_documents_document_type_idx" ON "customer_documents"("document_type");
CREATE INDEX "kyc_verifications_customer_id_idx" ON "kyc_verifications"("customer_id");
CREATE INDEX "kyc_verifications_status_idx" ON "kyc_verifications"("status");
CREATE INDEX "credit_transactions_account_id_idx" ON "credit_transactions"("account_id");
CREATE INDEX "credit_transactions_created_at_idx" ON "credit_transactions"("created_at");
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions"("type");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "customer_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
