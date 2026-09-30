import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  ShoppingCart,
  ClipboardList,
  FileText,
  TrendingUp,
  Wallet,
  Scale,
  BookOpen,
  Coins,
  Truck,
  Package,
  BarChart3,
  ScrollText,
  Bell,
  Clock,
  Shield,
} from 'lucide-react';
import { hasPermission } from './permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the user has any of these permissions. */
  anyOf: readonly string[];
  group: string;
}

export const DASHBOARD_NAV: NavItem[] = [
  {
    href: '/dashboard/overview',
    label: 'داشبورد',
    icon: LayoutDashboard,
    anyOf: ['financial_report.read'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/customers',
    label: 'مشتریان',
    icon: Users,
    anyOf: ['customer.read'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/kyc',
    label: 'احراز هویت',
    icon: ShieldCheck,
    anyOf: ['kyc.review', 'kyc.documents.read'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/orders',
    label: 'سفارش‌ها',
    icon: ShoppingCart,
    anyOf: ['order.read'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/assignments',
    label: 'صف بررسی',
    icon: ClipboardList,
    anyOf: ['trade.review', 'order.assign'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/quotations',
    label: 'پیش‌فاکتورها',
    icon: FileText,
    anyOf: ['quotation.read'],
    group: 'عملیات',
  },
  {
    href: '/dashboard/trades',
    label: 'معاملات',
    icon: TrendingUp,
    anyOf: ['trade.read', 'trade.approve'],
    group: 'عملیات',
  },
  {
    href: '/admin/trading-management',
    label: 'برنامه معاملات',
    icon: Clock,
    anyOf: [
      'trading.schedule.view',
      'trading.schedule.manage',
      'trading.limits.view',
      'trading.limits.manage',
      'trading.holidays.manage',
      'trading.audit.view',
    ],
    group: 'عملیات',
  },
  {
    href: '/dashboard/payments',
    label: 'پرداخت‌ها',
    icon: Wallet,
    anyOf: ['payment.read', 'payment.create'],
    group: 'مالی',
  },
  {
    href: '/dashboard/settlements',
    label: 'تسویه',
    icon: Scale,
    anyOf: ['settlement.read', 'financial_report.read'],
    group: 'مالی',
  },
  {
    href: '/dashboard/ledger/financial',
    label: 'دفتر مالی',
    icon: BookOpen,
    anyOf: ['ledger.read'],
    group: 'مالی',
  },
  {
    href: '/dashboard/ledger/gold',
    label: 'دفتر طلا',
    icon: Coins,
    anyOf: ['ledger.read'],
    group: 'مالی',
  },
  {
    href: '/dashboard/suppliers',
    label: 'تأمین‌کنندگان',
    icon: Truck,
    anyOf: ['supplier.read'],
    group: 'تأمین',
  },
  {
    href: '/dashboard/purchases',
    label: 'خریدها',
    icon: Package,
    anyOf: ['purchase.read'],
    group: 'تأمین',
  },
  {
    href: '/dashboard/reports',
    label: 'گزارش‌ها',
    icon: BarChart3,
    anyOf: ['reports', 'financial_report.read'],
    group: 'گزارش‌ها',
  },
  {
    href: '/dashboard/audit',
    label: 'ممیزی',
    icon: ScrollText,
    anyOf: ['ledger.read'],
    group: 'گزارش‌ها',
  },
  {
    href: '/dashboard/notifications',
    label: 'اعلان‌ها',
    icon: Bell,
    anyOf: [],
    group: 'سیستم',
  },
  {
    href: '/dashboard/settings/sessions',
    label: 'مدیریت نشست',
    icon: Shield,
    anyOf: ['session.policy.manage', 'user.manage'],
    group: 'سیستم',
  },
];

export function visibleNav(permissions: readonly string[] | undefined | null): NavItem[] {
  return DASHBOARD_NAV.filter(
    (item) => item.anyOf.length === 0 || hasPermission(permissions, item.anyOf),
  );
}

export function firstStaffRoute(permissions: readonly string[] | undefined | null): string {
  return visibleNav(permissions)[0]?.href ?? '/dashboard/notifications';
}
