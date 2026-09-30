-- Role-based session limits. Existing refresh-token rows are kept and treated as sessions.

CREATE TYPE "SessionLimitType" AS ENUM ('LIMITED', 'UNLIMITED');
CREATE TYPE "SessionLoginBehavior" AS ENUM ('BLOCK', 'REVOKE_OLDEST', 'REQUIRE_CONFIRMATION');
CREATE TYPE "UserSessionPolicyMode" AS ENUM ('INHERIT', 'CUSTOM');

ALTER TABLE "refresh_tokens" ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "refresh_tokens" ADD COLUMN "device_name" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "browser" TEXT;
ALTER TABLE "refresh_tokens" ADD COLUMN "os" TEXT;

CREATE INDEX "refresh_tokens_user_id_revoked_at_expires_at_idx" ON "refresh_tokens"("user_id", "revoked_at", "expires_at");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
CREATE INDEX "refresh_tokens_revoked_at_idx" ON "refresh_tokens"("revoked_at");

CREATE TABLE "session_settings" (
    "id" TEXT NOT NULL,
    "limit_type" "SessionLimitType" NOT NULL DEFAULT 'LIMITED',
    "max_sessions" INTEGER,
    "login_behavior" "SessionLoginBehavior" NOT NULL DEFAULT 'BLOCK',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "session_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "session_settings" ("id", "limit_type", "max_sessions", "login_behavior", "updated_at")
VALUES ('global', 'LIMITED', 1, 'BLOCK', CURRENT_TIMESTAMP);

CREATE TABLE "role_session_policies" (
    "role_id" TEXT NOT NULL,
    "use_default" BOOLEAN NOT NULL DEFAULT true,
    "limit_type" "SessionLimitType",
    "max_sessions" INTEGER,
    "login_behavior" "SessionLoginBehavior",
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "role_session_policies_pkey" PRIMARY KEY ("role_id")
);

CREATE TABLE "user_session_policies" (
    "user_id" TEXT NOT NULL,
    "mode" "UserSessionPolicyMode" NOT NULL DEFAULT 'INHERIT',
    "limit_type" "SessionLimitType",
    "max_sessions" INTEGER,
    "login_behavior" "SessionLoginBehavior",
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by_id" TEXT,

    CONSTRAINT "user_session_policies_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "login_confirmations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "login_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "login_confirmations_token_hash_key" ON "login_confirmations"("token_hash");
CREATE INDEX "login_confirmations_user_id_idx" ON "login_confirmations"("user_id");

ALTER TABLE "role_session_policies" ADD CONSTRAINT "role_session_policies_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_session_policies" ADD CONSTRAINT "user_session_policies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "login_confirmations" ADD CONSTRAINT "login_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "key", "module", "description", "created_at")
VALUES (
  'perm_session_policy_manage',
  'session.policy.manage',
  'sessions',
  'Manage concurrent session limits',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('store_manager', 'platform_admin')
  AND p."key" = 'session.policy.manage'
ON CONFLICT DO NOTHING;
