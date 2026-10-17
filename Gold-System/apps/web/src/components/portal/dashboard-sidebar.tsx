'use client';

import { useId, useState, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Coins,
  WalletCards,
  ArrowLeftRight,
  ShoppingCart,
  BarChart3,
  CreditCard,
  Bell,
  UserRound,
  ShieldCheck,
  Headset,
  Settings,
  X,
  LogOut,
  FileText,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import useSWR from 'swr';
import { customerApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { customerTypeBadgeLabel, CUSTOMER_ACCOUNT_STATUS_LABELS, cn } from '@/lib/utils';
import { MobileNumber } from '@/components/ui/mobile-input';
import { Button } from '@/components/ui/button';
import { SidebarShell } from '@/components/navigation/sidebar-shell';
import { SidebarBrand } from '@/components/navigation/sidebar-brand';
import { SidebarNavItem } from '@/components/navigation/sidebar-nav-item';
import { SidebarLogout } from '@/components/navigation/sidebar-logout';
import { CustomerAvatar } from '@/components/portal/customer-avatar';
import { PortalSupportModal } from '@/components/portal/portal-support-modal';
import { HeaderKycStatus } from '@/components/portal/header-kyc-status';
import { PendingPickupCard } from '@/components/portal/pending-pickup-card';
import { RialBalanceCard } from '@/components/portal/rial-balance-card';
import { ThemeCycleButton } from '@/components/theme-toggle';

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  exact?: boolean;
  query?: Record<string, string>;
  permission?: string;
};

const primaryNav: NavItem[] = [
  {
    href: '/portal/dashboard',
    label: 'داشبورد',
    description: 'نمای کلی حساب شما',
    icon: LayoutDashboard,
    iconClassName: 'bg-amber-50 text-amber-700',
    exact: true,
  },
  {
    href: '/portal/assets',
    label: 'دارایی من',
    description: 'موجودی طلا و ارزش دارایی',
    icon: Coins,
    iconClassName: 'bg-sky-50 text-sky-700',
    permission: 'customer.account.read_own',
  },
  {
    href: '/portal/credit',
    label: 'اعتبار',
    description: 'موجودی تومانی و گردش حساب',
    icon: WalletCards,
    iconClassName: 'bg-emerald-50 text-emerald-700',
    permission: 'customer.account.read_own',
  },
  {
    href: '/portal/orders/new',
    label: 'خرید و فروش',
    description: 'خرید و فروش طلای آبشده',
    icon: ArrowLeftRight,
    iconClassName: 'bg-blue-50 text-blue-700',
    permission: 'customer.order.create',
  },
  {
    href: '/portal/orders',
    label: 'سفارش‌ها',
    description: 'مدیریت سفارش‌های خرید و فروش',
    icon: ShoppingCart,
    iconClassName: 'bg-violet-50 text-violet-700',
    exact: true,
    permission: 'customer.order.read_own',
  },
  {
    href: '/portal/pickups',
    label: 'تحویل حضوری',
    description: 'دریافت طلای آبشده از فروشگاه',
    icon: Package,
    iconClassName: 'bg-teal-50 text-teal-700',
    permission: 'customer.pickup.read_own',
  },
  {
    href: '/portal/trades',
    label: 'معاملات',
    description: 'تاریخچه معاملات شما',
    icon: BarChart3,
    iconClassName: 'bg-orange-50 text-orange-700',
    permission: 'customer.order.read_own',
  },
  {
    href: '/portal/payments',
    label: 'پرداخت‌ها',
    description: 'واریزها و برداشت‌ها',
    icon: CreditCard,
    iconClassName: 'bg-indigo-50 text-indigo-700',
    permission: 'customer.payment.read_own',
  },
  {
    href: '/portal/notifications',
    label: 'اعلان‌ها',
    description: 'پیام‌ها و اطلاعیه‌ها',
    icon: Bell,
    iconClassName: 'bg-red-50 text-red-700',
  },
];

const accountNav: NavItem[] = [
  {
    href: '/portal/profile',
    label: 'پروفایل',
    description: 'اطلاعات شخصی و تنظیمات حساب',
    icon: UserRound,
    iconClassName: 'bg-sky-50 text-sky-700',
    permission: 'customer.profile.read',
  },
  {
    href: '/portal/kyc',
    label: 'احراز هویت',
    description: 'تکمیل و مدیریت مدارک',
    icon: ShieldCheck,
    iconClassName: 'bg-emerald-50 text-emerald-700',
  },
];

type MobileNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  href?: string;
  exact?: boolean;
  permission?: string;
  onClick?: () => void;
  trailing?: ReactNode;
};

function itemHref(item: NavItem): string {
  if (!item.query) return item.href;
  const params = new URLSearchParams(item.query);
  return `${item.href}?${params.toString()}`;
}

function isActive(pathname: string, search: string, item: NavItem): boolean {
  if (item.query) {
    const params = new URLSearchParams(search);
    return (
      pathname === item.href &&
      Object.entries(item.query).every(([key, value]) => params.get(key) === value)
    );
  }
  if (item.href === '/portal/orders' && item.exact) {
    if (pathname === '/portal/orders/new') return false;
    return pathname === '/portal/orders' || pathname.startsWith('/portal/orders/');
  }
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function isMobileActive(pathname: string, item: MobileNavItem): boolean {
  if (!item.href) return false;
  if (item.href.includes('#')) {
    const [path] = item.href.split('#');
    return pathname === path;
  }
  if (item.exact) return pathname === item.href;
  if (item.href === '/portal/payments') {
    return (
      pathname === '/portal/payments' ||
      pathname.startsWith('/portal/payments/') ||
      pathname === '/portal/trades' ||
      pathname.startsWith('/portal/trades/')
    );
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function canShow(permissions: readonly string[] | undefined | null, permission?: string): boolean {
  if (!permission) return true;
  // While permissions are unknown, keep links visible to avoid an empty drawer flash.
  if (permissions == null) return true;
  if (permissions.length === 0) return true;
  return hasPermission(permissions, permission);
}

function SectionHeading({ children }: { children: string }) {
  return <p className="px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">{children}</p>;
}

export function DashboardSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { user, logout } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);
  const titleId = useId();
  const { data: customer } = useSWR('customer/me', () => customerApi.getMe());
  const fullName = customer
    ? `${customer.firstName} ${customer.lastName}`.trim()
    : 'کاربر';
  const typeLabel = customerTypeBadgeLabel(customer?.type);
  const accountStatus = customer?.accountStatus ?? customer?.status;
  const accountLabel = accountStatus
    ? (CUSTOMER_ACCOUNT_STATUS_LABELS[accountStatus] ??
      (accountStatus === 'ACTIVE' || accountStatus === 'APPROVED' ? 'فعال' : accountStatus))
    : null;
  const accountActive = accountStatus === 'ACTIVE' || accountStatus === 'APPROVED';

  const mobileItems: MobileNavItem[] = [
    {
      key: 'dashboard',
      label: 'داشبورد',
      icon: LayoutDashboard,
      href: '/portal/dashboard',
      exact: true,
    },
    {
      key: 'trade',
      label: 'خرید و فروش طلا',
      icon: ShoppingCart,
      href: '/portal/orders/new',
      permission: 'customer.order.create',
    },
    {
      key: 'assets',
      label: 'دارایی‌های من',
      icon: Coins,
      href: '/portal/assets',
      permission: 'customer.account.read_own',
    },
    {
      key: 'payments',
      label: 'تراکنش‌ها و پرداخت‌ها',
      icon: FileText,
      href: '/portal/payments',
      permission: 'customer.payment.read_own',
    },
    {
      key: 'kyc',
      label: 'احراز هویت',
      icon: ShieldCheck,
      href: '/portal/kyc',
    },
    {
      key: 'profile',
      label: 'پروفایل و اطلاعات حساب',
      icon: UserRound,
      href: '/portal/profile',
      permission: 'customer.profile.read',
    },
    {
      key: 'support',
      label: 'پشتیبانی و راهنما',
      icon: Headset,
      onClick: () => setSupportOpen(true),
    },
    {
      key: 'settings',
      label: 'تنظیمات',
      icon: Settings,
      href: '/portal/profile#settings',
    },
  ].filter((item) => canShow(user?.permissions, item.permission));

  return (
    <>
      <SidebarShell open={open} onClose={onClose} labelledBy={titleId}>
        {/* Desktop sidebar — unchanged gold chrome */}
        <div className="hidden min-h-0 flex-1 flex-col lg:flex">
          <SidebarBrand subtitle="معاملات آنلاین طلای آبشده" onClose={onClose} />

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="منوی پورتال">
            <div className="space-y-1">
              {primaryNav
                .filter((item) => canShow(user?.permissions, item.permission))
                .map((item) => (
                  <SidebarNavItem
                    key={itemHref(item)}
                    href={itemHref(item)}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    iconClassName={item.iconClassName}
                    active={isActive(pathname, search, item)}
                    onNavigate={onClose}
                  />
                ))}
            </div>

            <div className="space-y-1 border-t border-slate-100 pt-3">
              <SectionHeading>حساب کاربری</SectionHeading>
              {accountNav
                .filter((item) => canShow(user?.permissions, item.permission))
                .map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    iconClassName={item.iconClassName}
                    active={isActive(pathname, search, item)}
                    onNavigate={onClose}
                  />
                ))}
            </div>

            <div className="space-y-1 border-t border-slate-100 pt-3">
              <SectionHeading>پشتیبانی</SectionHeading>
              <SidebarNavItem
                label="راهنما و پشتیبانی"
                description="سوالات متداول و ارتباط با ما"
                icon={Headset}
                iconClassName="bg-violet-50 text-violet-700"
                onClick={() => setSupportOpen(true)}
                onNavigate={onClose}
              />
            </div>
          </nav>

          <SidebarLogout
            onClick={() => void logout()}
            footer={user ? <MobileNumber value={user.mobile} /> : null}
          />
        </div>

        {/* Mobile drawer mounts only while open so off-canvas links stay inert */}
        {open ? (
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CustomerAvatar customer={customer} name={fullName} size="h-12 w-12" />
                <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 id={titleId} className="truncate text-base font-bold text-[#172033]">
                      {fullName}
                    </h2>
                    {typeLabel ? (
                      <p className="mt-0.5 truncate text-xs text-[#6B7280]">{typeLabel}</p>
                    ) : null}
                    {accountLabel ? (
                      <p
                        className={cn(
                          'mt-1 inline-flex items-center gap-1.5 text-xs font-medium',
                          accountActive ? 'text-emerald-700' : 'text-slate-500',
                        )}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 rounded-full',
                            accountActive ? 'bg-emerald-600' : 'bg-slate-400',
                          )}
                          aria-hidden
                        />
                        حساب {accountLabel}
                      </p>
                    ) : null}
                  </div>
                  <HeaderKycStatus className="shrink-0" />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={onClose}
                aria-label="بستن"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-3">
              <PendingPickupCard variant="drawer" />
              <RialBalanceCard variant="drawer" className="min-w-0" />
            </div>

            <nav
              className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3"
              aria-label="منوی کشویی پورتال"
            >
              {mobileItems.map((item) => {
                const active = isMobileActive(pathname, item);
                if (item.key === 'settings' && item.href) {
                  return (
                    <div key={item.key} className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <SidebarNavItem
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          active={active}
                          tone="emerald"
                          onNavigate={onClose}
                        />
                      </div>
                      <ThemeCycleButton className="h-10 w-10 shrink-0" />
                    </div>
                  );
                }
                if (item.href) {
                  return (
                    <SidebarNavItem
                      key={item.key}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      active={active}
                      tone="emerald"
                      onNavigate={onClose}
                    />
                  );
                }
                return (
                  <SidebarNavItem
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    tone="emerald"
                    onClick={() => item.onClick?.()}
                    onNavigate={onClose}
                  />
                );
              })}
            </nav>

            <div className="mt-auto border-t border-slate-100 px-4 py-4">
              {user ? (
                <div className="mb-2 truncate px-1 text-xs text-muted-foreground">
                  <MobileNumber value={user.mobile} />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void logout();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                خروج از حساب
              </button>
            </div>
          </div>
        ) : (
          <h2 id={titleId} className="sr-only lg:hidden">
            منوی پورتال
          </h2>
        )}
      </SidebarShell>

      <PortalSupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
