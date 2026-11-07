ALTER TABLE "sms_settings"
    ALTER COLUMN "provider" SET DEFAULT 'hisms',
    ADD COLUMN "api_base_url" TEXT,
    ADD COLUMN "username" TEXT,
    ADD COLUMN "password_encrypted" TEXT,
    ADD COLUMN "otp_template" TEXT,
    ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "otp_expires_in_seconds" INTEGER NOT NULL DEFAULT 120,
    ADD COLUMN "otp_resend_cooldown_seconds" INTEGER NOT NULL DEFAULT 60,
    ADD COLUMN "otp_max_attempts" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "connection_tested_at" TIMESTAMP(3),
    ADD COLUMN "connection_test_success" BOOLEAN,
    ADD COLUMN "connection_test_message" TEXT;

UPDATE "sms_settings" SET "enabled" = TRUE WHERE "provider" IN ('smsir', 'melipayamak');

CREATE TABLE "sms_message_logs" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipient_masked" TEXT NOT NULL,
    "template_code" TEXT,
    "provider_reference_id" TEXT,
    "provider_error_code" INTEGER,
    "acceptance_status" TEXT NOT NULL,
    "delivery_status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sms_message_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sms_message_logs_created_at_idx" ON "sms_message_logs"("created_at");
CREATE INDEX "sms_message_logs_provider_reference_id_idx" ON "sms_message_logs"("provider_reference_id");
