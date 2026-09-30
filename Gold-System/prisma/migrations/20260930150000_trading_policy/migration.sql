-- Trading hours, holidays, and limits. Usage is derived from confirmed trades.

CREATE TYPE "TradingWeekday" AS ENUM (
  'SATURDAY',
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY'
);

CREATE TYPE "TradingOverrideKind" AS ENUM ('FULL_CLOSURE', 'SPECIAL_SCHEDULE');

CREATE TYPE "TradingLimitScope" AS ENUM (
  'GLOBAL',
  'ROLE',
  'USER',
  'CUSTOMER',
  'TRANSACTION_TYPE'
);

CREATE TABLE "trading_schedules" (
  "id" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tehran',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trading_schedules_pkey" PRIMARY KEY ("id")
);

INSERT INTO "trading_schedules" ("id", "timezone", "enabled", "created_at", "updated_at")
VALUES ('global', 'Asia/Tehran', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

CREATE TABLE "trading_day_overrides" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "kind" "TradingOverrideKind" NOT NULL,
  "title" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trading_day_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "trading_day_overrides_date_key" ON "trading_day_overrides"("date");
CREATE INDEX "trading_day_overrides_date_idx" ON "trading_day_overrides"("date");

CREATE TABLE "trading_sessions" (
  "id" TEXT NOT NULL,
  "schedule_id" TEXT NOT NULL DEFAULT 'global',
  "weekday" "TradingWeekday",
  "day_override_id" TEXT,
  "title" TEXT NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "max_amount_rial" DECIMAL(20, 2),
  "min_amount_rial" DECIMAL(20, 2),
  "max_weight_grams" DECIMAL(12, 6),
  "min_weight_grams" DECIMAL(12, 6),
  "max_count" INTEGER,
  "max_single_amount_rial" DECIMAL(20, 2),
  "max_single_weight_grams" DECIMAL(12, 6),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trading_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "trading_sessions_owner_check" CHECK (
    ("weekday" IS NOT NULL AND "day_override_id" IS NULL)
    OR ("weekday" IS NULL AND "day_override_id" IS NOT NULL)
  ),
  CONSTRAINT "trading_sessions_time_check" CHECK (
    "start_minute" >= 0
    AND "end_minute" <= 1440
    AND "start_minute" < "end_minute"
  )
);

CREATE INDEX "trading_sessions_weekday_idx" ON "trading_sessions"("weekday");
CREATE INDEX "trading_sessions_day_override_id_idx" ON "trading_sessions"("day_override_id");
CREATE INDEX "trading_sessions_start_minute_end_minute_idx" ON "trading_sessions"("start_minute", "end_minute");

CREATE TABLE "trading_limits" (
  "id" TEXT NOT NULL,
  "scope" "TradingLimitScope" NOT NULL,
  "scope_key" TEXT,
  "session_id" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "max_amount_rial" DECIMAL(20, 2),
  "min_amount_rial" DECIMAL(20, 2),
  "max_weight_grams" DECIMAL(12, 6),
  "min_weight_grams" DECIMAL(12, 6),
  "max_count" INTEGER,
  "max_single_amount_rial" DECIMAL(20, 2),
  "max_single_weight_grams" DECIMAL(12, 6),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "trading_limits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trading_limits_scope_scope_key_idx" ON "trading_limits"("scope", "scope_key");
CREATE INDEX "trading_limits_session_id_idx" ON "trading_limits"("session_id");

ALTER TABLE "trading_sessions"
  ADD CONSTRAINT "trading_sessions_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "trading_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "trading_sessions"
  ADD CONSTRAINT "trading_sessions_day_override_id_fkey"
  FOREIGN KEY ("day_override_id") REFERENCES "trading_day_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trading_limits"
  ADD CONSTRAINT "trading_limits_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "trading_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
