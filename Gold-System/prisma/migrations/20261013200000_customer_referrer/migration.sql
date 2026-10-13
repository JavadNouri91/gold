-- Link a new customer to an existing referrer (معرف).
ALTER TABLE "customers"
ADD COLUMN "referrer_id" TEXT;

ALTER TABLE "customers"
ADD CONSTRAINT "customers_referrer_id_fkey"
FOREIGN KEY ("referrer_id") REFERENCES "customers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "customers_referrer_id_idx" ON "customers"("referrer_id");
