CREATE TABLE "sms_event_settings" (
    "event_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipient_policy" TEXT NOT NULL DEFAULT 'USER',
    "template_code" TEXT,
    "parameter_fields" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,
    CONSTRAINT "sms_event_settings_pkey" PRIMARY KEY ("event_id")
);

ALTER TABLE "sms_message_logs" ADD COLUMN "event_id" TEXT;
ALTER TABLE "sms_message_logs" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "sms_message_logs_idempotency_key_key" ON "sms_message_logs"("idempotency_key");
