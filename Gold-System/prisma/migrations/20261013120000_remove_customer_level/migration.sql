-- Drop unused customer tier field (classification uses CustomerType only).
ALTER TABLE "customers" DROP COLUMN "level";

DROP TYPE "CustomerLevel";
