'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Coins,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingCart,
  TrendingUp,
  WalletCards,
  Bell,
  User,
  ShieldCheck,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  query?: Record<string, string>;
};

const primaryNav: NavItem[] = [
  { href: '/portal/dashboard', label: 'داشبورد', icon: LayoutDashboard, exact: true },
  { href: '/portal/assets', label: 'دارایی من', icon: Coins },
  { href: '/portal/credit', label: 'اعتبار', icon: CreditCard },
  { href: '/portal/orders/new', label: 'خرید طلا', icon: ArrowDownLeft, query: { side: 'buy' } },
  { href: '/portal/orders/new', label: 'فروش طلا', icon: ArrowUpRight, query: { side: 'sell' } },
  { href: '/portal/orders', label: 'سفارش‌ها', icon: ShoppingCart, exact: true },
  { href: '/portal/trades', label: 'معاملات', icon: TrendingUp },
  { href: '/portal/payments', label: 'پرداخت‌ها', icon: WalletCards },
  { href: '/portal/notifications', label: 'اعلان‌ها', icon: Bell },
];

const accountNav: NavItem[] = [
  { href: '/portal/profile', label: 'پروفایل', icon: User },
  { href: '/portal/kyc', label: 'احراز هویت', icon: ShieldCheck },
  { href: '/portal/settings', label: 'تنظیمات', icon: Settings },
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

function NavLink({
  item,
  pathname,
  search,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  search: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(pathname, search, item);
  return (
    <Link
      href={itemHref(item)}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-[#FFF4D6] text-[#B77900]'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', active && 'text-[#D99A00]')} />
      {item.label}
    </Link>
  );
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

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="بستن منو"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-64 flex-col border-l border-slate-100 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-100 text-lg" aria-hidden>
              🟡
            </span>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">سامانه طلا</p>
              <p className="text-[11px] text-muted-foreground truncate">معاملات آنلاین طلای آبشده</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={onClose} aria-label="بستن">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4" aria-label="منوی پورتال">
          <div className="space-y-1">
            {primaryNav.map((item) => (
              <NavLink
                key={itemHref(item)}
                item={item}
                pathname={pathname}
                search={search}
                onNavigate={onClose}
              />
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3 space-y-1">
            {accountNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                search={search}
                onNavigate={onClose}
              />
            ))}
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-slate-100">
          {user ? (
            <div className="px-3 pb-2 text-xs text-muted-foreground truncate">
              <MobileNumber value={user.mobile} />
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
        </div>
      </aside>
    </>
  );
}
