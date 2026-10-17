-- Who cancelled a physical gold pickup (CUSTOMER | STAFF)
ALTER TABLE "physical_gold_pickups"
  ADD COLUMN "cancelled_by_kind" TEXT;
