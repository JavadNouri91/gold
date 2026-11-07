ALTER TABLE "sms_event_settings"
  ADD COLUMN "sending_mode" TEXT NOT NULL DEFAULT 'provider_template',
  ADD COLUMN "custom_message" TEXT;
