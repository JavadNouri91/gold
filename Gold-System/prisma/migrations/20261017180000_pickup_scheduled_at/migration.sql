-- Planned in-store handover date for physical gold pickups
ALTER TABLE "physical_gold_pickups"
  ADD COLUMN "scheduled_pickup_at" TIMESTAMP(3);
