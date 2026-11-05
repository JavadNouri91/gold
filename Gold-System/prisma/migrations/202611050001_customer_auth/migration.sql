BEGIN;
-- Abort instead of silently merging identities. Existing unique constraints stay in place.
CREATE FUNCTION pg_temp.auth_mobile(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(translate(btrim(value), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '[[:space:]()-]', '', 'g'), '^(\+98|0098|98)(9[0-9]{9})$', '0\2');
$$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users GROUP BY pg_temp.auth_mobile(mobile) HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM customers GROUP BY pg_temp.auth_mobile(mobile) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Normalized mobile collision: run the documented preflight and resolve identities manually';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE pg_temp.auth_mobile(mobile) !~ '^09[0-9]{9}$')
     OR EXISTS (SELECT 1 FROM customers WHERE pg_temp.auth_mobile(mobile) !~ '^09[0-9]{9}$') THEN
    RAISE EXCEPTION 'Invalid legacy mobile: correct it before deploying authentication';
  END IF;
  IF EXISTS (SELECT 1 FROM customers c JOIN users u ON c.user_id = u.id
             WHERE pg_temp.auth_mobile(c.mobile) <> pg_temp.auth_mobile(u.mobile)) THEN
    RAISE EXCEPTION 'User/customer mobile mismatch: resolve before deploying authentication';
  END IF;
END $$;
UPDATE users SET mobile = pg_temp.auth_mobile(mobile) WHERE mobile <> pg_temp.auth_mobile(mobile);
UPDATE customers SET mobile = pg_temp.auth_mobile(mobile) WHERE mobile <> pg_temp.auth_mobile(mobile);
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'REGISTRATION';
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'CUSTOMER_LOGIN';
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'RESET_GRANT';
ALTER TABLE "users" ADD COLUMN "mobile_verified_at" TIMESTAMP(3);
ALTER TABLE "customers" ALTER COLUMN "national_id" DROP NOT NULL;
ALTER TABLE "otp_codes" ADD COLUMN "payload" JSONB;
CREATE TABLE "auth_rate_limits" ("key" TEXT PRIMARY KEY, "count" INTEGER NOT NULL DEFAULT 0, "expires_at" TIMESTAMP(3) NOT NULL);
CREATE INDEX "auth_rate_limits_expires_at_idx" ON "auth_rate_limits"("expires_at");
COMMIT;
