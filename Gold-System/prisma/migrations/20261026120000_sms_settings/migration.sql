-- CreateTable
CREATE TABLE "sms_settings" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "api_key_encrypted" TEXT,
    "sender_line" TEXT,
    "smsir_base_url" TEXT,
    "melipayamak_base_url" TEXT,
    "melipayamak_password_encrypted" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "sms_settings_pkey" PRIMARY KEY ("id")
);
