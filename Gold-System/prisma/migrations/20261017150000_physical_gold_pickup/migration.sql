-- Physical gold pickup (melted gold bar redemption at store)

CREATE TYPE "PhysicalGoldPickupStatus" AS ENUM (
  'REQUESTED',
  'PREPARING',
  'READY',
  'DELIVERED',
  'CANCELLED'
);

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PICKUP_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PICKUP_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PICKUP_DELIVERED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PICKUP_CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'INTERNAL_NEW_PICKUP';

CREATE TABLE "physical_gold_pickups" (
    "id" TEXT NOT NULL,
    "pickup_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "weight_grams" DECIMAL(12,6) NOT NULL,
    "purity_ratio" DECIMAL(8,6) NOT NULL,
    "status" "PhysicalGoldPickupStatus" NOT NULL DEFAULT 'REQUESTED',
    "customer_note" TEXT,
    "staff_note" TEXT,
    "cancel_reason" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparing_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "preparing_by_id" TEXT,
    "ready_by_id" TEXT,
    "delivered_by_id" TEXT,
    "cancelled_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_gold_pickups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "physical_gold_pickups_pickup_number_key" ON "physical_gold_pickups"("pickup_number");
CREATE INDEX "physical_gold_pickups_customer_id_status_idx" ON "physical_gold_pickups"("customer_id", "status");
CREATE INDEX "physical_gold_pickups_status_requested_at_idx" ON "physical_gold_pickups"("status", "requested_at");
CREATE INDEX "physical_gold_pickups_store_id_idx" ON "physical_gold_pickups"("store_id");

ALTER TABLE "physical_gold_pickups"
  ADD CONSTRAINT "physical_gold_pickups_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "physical_gold_pickups"
  ADD CONSTRAINT "physical_gold_pickups_preparing_by_id_fkey"
  FOREIGN KEY ("preparing_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "physical_gold_pickups"
  ADD CONSTRAINT "physical_gold_pickups_ready_by_id_fkey"
  FOREIGN KEY ("ready_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "physical_gold_pickups"
  ADD CONSTRAINT "physical_gold_pickups_delivered_by_id_fkey"
  FOREIGN KEY ("delivered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "physical_gold_pickups"
  ADD CONSTRAINT "physical_gold_pickups_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "physical_gold_pickup_events" (
    "id" TEXT NOT NULL,
    "pickup_id" TEXT NOT NULL,
    "status" "PhysicalGoldPickupStatus" NOT NULL,
    "note" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_gold_pickup_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "physical_gold_pickup_events_pickup_id_created_at_idx"
  ON "physical_gold_pickup_events"("pickup_id", "created_at");

ALTER TABLE "physical_gold_pickup_events"
  ADD CONSTRAINT "physical_gold_pickup_events_pickup_id_fkey"
  FOREIGN KEY ("pickup_id") REFERENCES "physical_gold_pickups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "physical_gold_pickup_events"
  ADD CONSTRAINT "physical_gold_pickup_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
