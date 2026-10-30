import { Module } from '@nestjs/common';
import { PickupsController, StaffPickupsController } from './presentation/controllers/pickups.controller';
import { PickupService } from './application/pickup.service';
import { PickupFeeService } from './application/pickup-fee.service';
import { PickupDocumentService } from './application/pickup-document.service';
import { PickupRepository } from './infrastructure/repositories/pickup.repository';
import { OrdersModule } from '../orders/orders.module';
import { CustomerAccountsModule } from '../customer-accounts/customer-accounts.module';
import { GoldLedgerModule } from '../gold-ledger/gold-ledger.module';
import { FinancialLedgerModule } from '../financial-ledger/financial-ledger.module';
import { PricingModule } from '../pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Physical gold pickup — redeem melted-gold balance as a bar at the store.
 *
 * Flow: REQUESTED → PREPARING → READY → DELIVERED
 * Cancel releases the reserved weight (any status except DELIVERED).
 *
 * Holding: non-CANCELLED pickups reduce sellable grams immediately.
 * Ledger: GA-02 OUT on DELIVERED only (GA-01 deferred — open-questions #39).
 * Fee: conversion fee reserved at request (PICKUP), consumed at delivery (FA-16).
 */
@Module({
  imports: [
    OrdersModule,
    CustomerAccountsModule,
    GoldLedgerModule,
    FinancialLedgerModule,
    PricingModule,
    NotificationsModule,
    AuditModule,
  ],
  controllers: [PickupsController, StaffPickupsController],
  providers: [PickupService, PickupFeeService, PickupDocumentService, PickupRepository],
  exports: [PickupService, PickupRepository],
})
export class PickupsModule {}
