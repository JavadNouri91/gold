/**
 * Gold System — Database Seed
 * Creates system roles, permissions, and default admin user.
 *
 * Usage: pnpm db:seed
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// ─── Permissions (docs/04-actors-and-permissions.md) ─────────
const PERMISSIONS = [
  // Customer
  { key: 'customer.profile.read', module: 'customers', description: 'Read own customer profile' },
  { key: 'customer.read', module: 'customers', description: 'Read any customer profile' },
  { key: 'customer.order.create', module: 'orders', description: 'Create customer order' },
  { key: 'customer.order.read_own', module: 'orders', description: 'Read own orders' },
  { key: 'customer.quotation.read_own', module: 'quotations', description: 'Read own quotations' },
  { key: 'customer.quotation.download_own', module: 'quotations', description: 'Download own quotations' },
  { key: 'customer.payment.read_own', module: 'payments', description: 'Read own payments' },
  { key: 'customer.account.read_own', module: 'customer-accounts', description: 'Read own account' },
  // Orders
  { key: 'order.read', module: 'orders', description: 'Read any order' },
  { key: 'order.assign', module: 'orders', description: 'Assign order to reviewer' },
  // Quotations
  { key: 'quotation.read', module: 'quotations', description: 'Read any quotation' },
  // Trades
  { key: 'trade.review', module: 'trades', description: 'Review trades (view and comment)' },
  { key: 'trade.comment', module: 'trades', description: 'Comment on trades' },
  { key: 'trade.revision', module: 'trades', description: 'Request trade revision' },
  { key: 'trade.approve', module: 'trades', description: 'Approve a trade (converts to confirmed Trade)' },
  { key: 'trade.reject', module: 'trades', description: 'Reject a trade' },
  { key: 'trade.request_revision', module: 'trades', description: 'Request revision on a trade' },
  // Payments
  { key: 'payment.create', module: 'payments', description: 'Create payment records' },
  { key: 'payment.read', module: 'payments', description: 'Read payment records' },
  { key: 'payment.reversal', module: 'payments', description: 'Reverse a payment' },
  // Settlement
  { key: 'settlement.manage', module: 'settlements', description: 'Manage settlement records' },
  // Ledger
  { key: 'ledger.read', module: 'ledger', description: 'Read ledger entries' },
  { key: 'ledger.adjustment', module: 'ledger', description: 'Post ledger adjustments/reversals' },
  // Reports
  { key: 'financial_report.read', module: 'reports', description: 'Read financial reports' },
  // Supplier
  { key: 'supplier_account.manage', module: 'suppliers', description: 'Manage supplier accounts' },
  // Customer accounts
  { key: 'customer.account.read', module: 'customer-accounts', description: 'Read any customer account' },
  // Pricing
  { key: 'pricing.rules.manage', module: 'pricing', description: 'Manage pricing rules and adjustments' },
  // Customer group / credit
  { key: 'customer.group.assign', module: 'customers', description: 'Assign customer type/group' },
  { key: 'credit.manage', module: 'customer-accounts', description: 'Manage customer credit' },
  // User / role management
  { key: 'user.read', module: 'users', description: 'Read user records' },
  { key: 'user.manage', module: 'users', description: 'Create and update users' },
  { key: 'user.role.manage', module: 'users', description: 'Assign roles to users' },
  { key: 'session.policy.manage', module: 'sessions', description: 'Manage concurrent session limits' },
  // Notifications
  { key: 'notification.manage', module: 'notifications', description: 'Manage notifications' },
  // Audit
  { key: 'audit.read', module: 'audit', description: 'Read audit logs' },
  // KYC
  { key: 'kyc.review', module: 'kyc', description: 'Review and decide on KYC submissions' },
  { key: 'kyc.documents.read', module: 'kyc', description: 'View KYC documents' },
  // Orders — keys enforced by OrdersController / OrdersService
  { key: 'order.reject', module: 'orders', description: 'Reject an order and release reserved credit' },
  { key: 'order.cancel', module: 'orders', description: 'Cancel any order (staff path)' },
  { key: 'trade.read', module: 'trades', description: 'List and read trades across customers' },
  // Payments — split of the accountant payment workflow
  { key: 'payment.validate', module: 'payments', description: 'Validate a recorded payment' },
  { key: 'payment.allocate', module: 'payments', description: 'Allocate a validated payment to a trade' },
  { key: 'settlement.read', module: 'settlements', description: 'Read settlement records' },
  { key: 'ledger.reconcile', module: 'ledger', description: 'Run ledger reconciliation checks' },
  // Reports — non-financial operational reports
  { key: 'reports', module: 'reports', description: 'Read operational reports' },
  // Notifications — staff inbox and retry
  { key: 'notification.read', module: 'notifications', description: 'Read notifications for any recipient' },
  { key: 'notification.admin', module: 'notifications', description: 'Retry failed notifications' },
  // Suppliers and purchases
  { key: 'supplier.create', module: 'suppliers', description: 'Create a supplier' },
  { key: 'supplier.read', module: 'suppliers', description: 'Read suppliers' },
  { key: 'supplier.update', module: 'suppliers', description: 'Update a supplier' },
  { key: 'supplier_account.read', module: 'suppliers', description: 'Read supplier account balances' },
  { key: 'purchase.create', module: 'purchases', description: 'Create or cancel a draft purchase' },
  { key: 'purchase.read', module: 'purchases', description: 'Read purchases' },
  { key: 'purchase.confirm', module: 'purchases', description: 'Confirm a draft purchase' },
  { key: 'trading.schedule.view', module: 'trading', description: 'View the trading schedule and live status' },
  { key: 'trading.schedule.manage', module: 'trading', description: 'Create and edit weekly trading sessions' },
  { key: 'trading.limits.view', module: 'trading', description: 'View trading limits and consumption' },
  { key: 'trading.limits.manage', module: 'trading', description: 'Configure trading limits' },
  { key: 'trading.holidays.manage', module: 'trading', description: 'Manage trading holidays and daily exceptions' },
  { key: 'trading.audit.view', module: 'trading', description: 'View trading schedule audit history' },
] as const;

// ─── Role definitions ─────────────────────────────────────────
const ROLES: Array<{ name: string; description: string; permissions: string[] }> = [
  {
    name: 'store_manager',
    description: 'Store Manager — full operational access',
    permissions: PERMISSIONS.map((p) => p.key), // all permissions
  },
  {
    name: 'seller',
    description: 'Seller — review and commercial operations',
    permissions: [
      'order.read', 'quotation.read', 'customer.read',
      'trade.read', 'trade.review', 'trade.comment', 'trade.approve', 'trade.reject',
      'trade.request_revision', 'customer.account.read',
    ],
  },
  {
    name: 'operator',
    description: 'Operator — assignment and workflow management',
    permissions: [
      'order.read', 'order.assign', 'quotation.read',
      'trade.read', 'trade.review', 'trade.request_revision',
      'notification.manage', 'notification.read', 'notification.admin',
      'purchase.create', 'purchase.read', 'purchase.confirm',
    ],
  },
  {
    name: 'reviewer',
    description: 'Reviewer/Approver — trade approval authority',
    permissions: [
      'order.read', 'order.reject', 'quotation.read',
      'trade.read', 'trade.review',
      'trade.approve', 'trade.reject', 'trade.request_revision',
      'kyc.review', 'kyc.documents.read',
    ],
  },
  {
    name: 'accountant',
    description: 'Accountant — financial records management',
    permissions: [
      'payment.create', 'payment.read', 'payment.validate', 'payment.allocate', 'payment.reversal',
      'settlement.manage', 'settlement.read',
      'ledger.read', 'ledger.adjustment', 'ledger.reconcile',
      'financial_report.read',
      'supplier_account.manage', 'supplier_account.read',
      'supplier.create', 'supplier.read', 'supplier.update',
      'purchase.create', 'purchase.read',
      'customer.account.read',
      'kyc.documents.read',
    ],
  },
  {
    name: 'customer',
    description: 'Customer — self-service portal access',
    permissions: [
      'customer.profile.read', 'customer.order.create',
      'customer.order.read_own', 'customer.quotation.read_own',
      'customer.quotation.download_own', 'customer.payment.read_own',
      'customer.account.read_own',
    ],
  },
  {
    name: 'platform_admin',
    description: 'Platform Admin — system administration',
    permissions: PERMISSIONS.map((p) => p.key),
  },
];

async function main() {
  console.log('🌱 Seeding Gold System database...');

  // ─── Permissions ───────────────────────────────────────────
  console.log('  → Upserting permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      create: { key: perm.key, module: perm.module, description: perm.description },
      update: { module: perm.module, description: perm.description },
    });
  }

  // ─── Roles ────────────────────────────────────────────────
  console.log('  → Upserting roles...');
  for (const roleDef of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: { name: roleDef.name, description: roleDef.description, isSystem: true },
      update: { description: roleDef.description },
    });

    // Sync permissions for role
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const permRecords = await prisma.permission.findMany({
      where: { key: { in: roleDef.permissions } },
    });
    await prisma.rolePermission.createMany({
      data: permRecords.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // ─── Default admin user ────────────────────────────────────
  const adminMobile = process.env.SEED_ADMIN_MOBILE ?? '09000000000';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  if (process.env.NODE_ENV === 'production' && adminPassword === 'ChangeMe123!') {
    throw new Error('SEED_ADMIN_PASSWORD must be set to a non-default value when NODE_ENV=production');
  }

  console.log(`  → Creating default admin user (${adminMobile})...`);
  const passwordHash = await argon2.hash(adminPassword);

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'platform_admin' } });

  const existing = await prisma.user.findUnique({ where: { mobile: adminMobile } });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: 'System Admin',
        mobile: adminMobile,
        passwordHash,
        roles: { create: [{ roleId: adminRole.id }] },
      },
    });
    console.log(`  ✓ Admin user created. Mobile: ${adminMobile}`);
  } else {
    console.log(`  ℹ Admin user already exists. Skipping.`);
  }

  // ─── Default store ─────────────────────────────────────────
  const storeCount = await prisma.store.count();
  if (storeCount === 0) {
    await prisma.store.create({
      data: {
        name: 'Gold System Store',
        status: 'ACTIVE',
      },
    });
    console.log('  ✓ Default store created.');
  }

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
