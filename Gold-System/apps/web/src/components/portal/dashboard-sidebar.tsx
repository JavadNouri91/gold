'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Coins,
  WalletCards,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  BarChart3,
  CreditCard,
  Bell,
  UserRound,
  ShieldCheck,
  Settings,
  Headset,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { MobileNumber } from '@/components/ui/mobile-input';
import { SidebarShell } from '@/components/navigation/sidebar-shell';
import { SidebarBrand } from '@/components/navigation/sidebar-brand';
import { SidebarNavItem } from '@/components/navigation/sidebar-nav-item';
import { SidebarLogout } from '@/components/navigation/sidebar-logout';
import { PortalSupportModal } from '@/components/portal/portal-support-modal';

type NavItem = {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  exact?: boolean;
  query?: Record<string, string>;
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
  },
  {
    href: '/portal/credit',
    label: 'اعتبار',
    description: 'موجودی ریالی و گردش حساب',
    icon: WalletCards,
    iconClassName: 'bg-emerald-50 text-emerald-700',
  },
  {
    href: '/portal/orders/new',
    label: 'خرید طلا',
    description: 'خرید طلای آبشده',
    icon: TrendingUp,
    iconClassName: 'bg-blue-50 text-blue-700',
    query: { side: 'buy' },
  },
  {
    href: '/portal/orders/new',
    label: 'فروش طلا',
    description: 'فروش طلای آبشده',
    icon: TrendingDown,
    iconClassName: 'bg-rose-50 text-rose-700',
    query: { side: 'sell' },
  },
  {
    href: '/portal/orders',
    label: 'سفارش‌ها',
    description: 'مدیریت سفارش‌های خرید و فروش',
    icon: ShoppingCart,
    iconClassName: 'bg-violet-50 text-violet-700',
    exact: true,
  },
  {
    href: '/portal/trades',
    label: 'معاملات',
    description: 'تاریخچه معاملات شما',
    icon: BarChart3,
    iconClassName: 'bg-orange-50 text-orange-700',
  },
  {
    href: '/portal/payments',
    label: 'پرداخت‌ها',
    description: 'واریزها و برداشت‌ها',
    icon: CreditCard,
    iconClassName: 'bg-indigo-50 text-indigo-700',
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
    description: 'اطلاعات شخصی و تماس',
    icon: UserRound,
    iconClassName: 'bg-sky-50 text-sky-700',
  },
  {
    href: '/portal/kyc',
    label: 'احراز هویت',
    description: 'تکمیل و مدیریت مدارک',
    icon: ShieldCheck,
    iconClassName: 'bg-emerald-50 text-emerald-700',
  },
  {
    href: '/portal/settings',
    label: 'تنظیمات',
    description: 'تنظیمات حساب و امنیت',
    icon: Settings,
    iconClassName: 'bg-slate-100 text-slate-700',
  },
];

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

  return (
    <>
      <SidebarShell open={open} onClose={onClose}>
        <SidebarBrand subtitle="معاملات آنلاین طلای آبشده" onClose={onClose} />

        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="منوی پورتال">
          <div className="space-y-1">
            {primaryNav.map((item) => (
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
            {accountNav.map((item) => (
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
      </SidebarShell>

      <PortalSupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
