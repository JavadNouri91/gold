import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import otpConfig from './config/otp.config';
import storageConfig from './config/storage.config';
import smsConfig from './config/sms.config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { StorageModule } from './common/storage/storage.module';

// ─── Phase 3 — Customer & KYC Vertical Slice ─────────────
import { CustomerAccountsModule } from './modules/customer-accounts/customer-accounts.module';
import { CustomersModule } from './modules/customers/customers.module';
import { KycModule } from './modules/kyc/kyc.module';

// ─── Phase 3.2 — Pricing Engine ───────────────────────────
import { PricingModule } from './modules/pricing/pricing.module';

// ─── Phase 3.3 — Orders + Credit Reservation ─────────────
import { OrdersModule } from './modules/orders/orders.module';

// ─── Phase 3.4 — Quotation ────────────────────────────────
import { QuotationsModule } from './modules/quotations/quotations.module';

// ─── Phase 3.5 — Assignment + Manual Review ───────────────
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { TradesModule } from './modules/trades/trades.module';

// ─── Phase 4 — Financial Ledger + Gold Ledger ─────────────
import { FinancialLedgerModule } from './modules/financial-ledger/financial-ledger.module';
import { GoldLedgerModule } from './modules/gold-ledger/gold-ledger.module';

// ─── Phase 5 — Payment + Settlement ───────────────────────
import { PaymentsModule } from './modules/payments/payments.module';
import { SettlementsModule } from './modules/settlements/settlements.module';

// ─── Phase 6 — Suppliers + Purchases ──────────────────────
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';

// ─── Phase 7 — Notifications + SMS ────────────────────────
import { NotificationsModule } from './modules/notifications/notifications.module';

// ─── Phase 8 — Reports + Dashboard ────────────────────────
import { ReportsModule } from './modules/reports/reports.module';
import { TradingPolicyModule } from './modules/trading-policy/trading-policy.module';

@Module({
  imports: [
    // ─── Configuration ───────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, otpConfig, storageConfig, smsConfig],
      validate: validateEnv,
      cache: true,
    }),

    // ─── Rate limiting ────────────────────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    // ─── Infrastructure (global) ──────────────────────────────
    PrismaModule,
    StorageModule,

    // ─── Phase 2 — Foundation modules ─────────────────────────
    AuditModule,
    UsersModule,
    AuthModule,
    SessionsModule,

    // ─── Phase 3 — Customer & KYC ─────────────────────────────
    CustomerAccountsModule,
    CustomersModule,
    KycModule,

    // ─── Phase 3.2 — Pricing Engine ───────────────────────────
    PricingModule,

    // ─── Phase 3.3 — Orders + Credit Reservation ──────────────
    OrdersModule,

    // ─── Phase 3.4 — Quotation ─────────────────────────────────
    QuotationsModule,

    // ─── Phase 3.5 — Assignment + Manual Review ────────────────
    AssignmentsModule,
    TradesModule,

    // ─── Phase 4 — Financial Ledger + Gold Ledger ──────────────
    // Note: FinancialLedgerModule and GoldLedgerModule are ALSO
    // imported by TradesModule (for TradeLedgerPostingService).
    // These top-level imports make the API endpoints available.
    FinancialLedgerModule,
    GoldLedgerModule,

    // ─── Phase 5 — Payment + Settlement ────────────────────────
    PaymentsModule,
    SettlementsModule,

    // ─── Phase 6 — Suppliers + Purchases ───────────────────────
    SuppliersModule,
    PurchasesModule,

    // ─── Phase 7 — Notifications + SMS ─────────────────────────
    // Note: NotificationsModule is ALSO imported by AuthModule, KycModule,
    // TradesModule, PaymentsModule, OrdersModule (for event dispatch).
    // This top-level import makes the notification API endpoints available.
    NotificationsModule,

    // ─── Phase 8 — Reports + Dashboard ──────────────────────────────────────────
    ReportsModule,

    TradingPolicyModule,
  ],
  providers: [
    // Order matters: throttle, then authentication, then permission checks.
    // @Public() skips JwtAuthGuard. Routes without @RequirePermissions stay
    // available to any authenticated user; ownership is enforced in services.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
