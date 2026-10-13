-- Preserve the first uploaded KYC object when staff later crop or rotate it.
ALTER TABLE "customer_documents"
ADD COLUMN "original_file_key" TEXT;
