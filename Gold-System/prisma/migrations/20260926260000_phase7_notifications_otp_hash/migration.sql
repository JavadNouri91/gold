-- Phase 7 — Notifications + OTP Hash Upgrade
-- docs/16-notifications-and-audit.md
-- docs/21-business-decisions.md §10, §11.1
-- open-questions.md #31 (provider selection TBD → mock/adapter architecture)

-- ============================================================
-- 1. OTP SECURITY — rename code → code_hash
--    OTP values must NEVER be stored in plaintext.
--    All existing rows: set code_hash = '' to invalidate active OTPs.
--    Any in-flight OTPs at migration time are considered expired.
-- ============================================================

ALTER TABLE otp_codes RENAME COLUMN code TO code_hash;

-- Invalidate all existing plaintext codes (they are now structurally unusable
-- because the verification logic expects argon2 hashes from this point forward).
UPDATE otp_codes SET used_at = NOW() WHERE used_at IS NULL;

-- ============================================================
-- 2. NOTIFICATION ENUMS
-- ============================================================

CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'IN_APP');

CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TYPE "NotificationType" AS ENUM (
    'CUSTOMER_REGISTERED',
    'KYC_APPROVED',
    'KYC_REJECTED',
    'ORDER_RECEIVED',
    'QUOTATION_GENERATED',
    'REVIEW_STARTED',
    'TRADE_CONFIRMED',
    'TRADE_REVERSED',
    'PAYMENT_RECORDED',
    'SETTLEMENT_COMPLETED',
    'INTERNAL_NEW_ORDER',
    'INTERNAL_ORDER_ASSIGNED',
    'INTERNAL_PENDING_REVIEW',
    'INTERNAL_PAYMENT_ISSUE',
    'INTERNAL_SETTLEMENT_ISSUE',
    'OTP_LOGIN'
);

-- ============================================================
-- 3. NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE notifications (
    id                      VARCHAR(30)             NOT NULL,
    recipient_id            VARCHAR(30),
    recipient_mobile        VARCHAR(20),
    channel                 "NotificationChannel"   NOT NULL,
    type                    "NotificationType"      NOT NULL,
    subject                 TEXT,
    body                    TEXT                    NOT NULL,
    status                  "NotificationStatus"    NOT NULL DEFAULT 'PENDING',
    related_entity_type     VARCHAR(100),
    related_entity_id       VARCHAR(30),
    provider_reference      VARCHAR(255),
    retry_count             INTEGER                 NOT NULL DEFAULT 0,
    max_retries             INTEGER                 NOT NULL DEFAULT 3,
    sent_at                 TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,
    error_message           TEXT,
    created_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    CONSTRAINT notifications_recipient_fk FOREIGN KEY (recipient_id)
        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX notifications_recipient_id_idx ON notifications (recipient_id);
CREATE INDEX notifications_status_idx       ON notifications (status);
CREATE INDEX notifications_related_entity_idx ON notifications (related_entity_id)
    WHERE related_entity_id IS NOT NULL;
CREATE INDEX notifications_type_idx         ON notifications (type);
CREATE INDEX notifications_created_at_idx   ON notifications (created_at);
