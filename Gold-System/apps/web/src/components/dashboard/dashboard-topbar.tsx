'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';

const LABELS: Record<string, string> = {
  dashboard: 'داشبورد',
  overview: 'نمای کلی',
  customers: 'مشتریان',
  kyc: 'احراز هویت',
  orders: 'سفارش‌ها',
  assignments: 'صف بررسی',
  quotations: 'پیش‌فاکتورها',
  trades: 'معاملات',
  payments: 'پرداخت‌ها',
  settlements: 'تسویه',
  ledger: 'دفاتر',
  financial: 'دفتر مالی',
  gold: 'دفتر طلا',
  suppliers: 'تأمین‌کنندگان',
  purchases: 'خریدها',
  reports: 'گزارش‌ها',
  audit: 'ممیزی',
  notifications: 'اعلان‌ها',
  pricing: 'قیمت‌گذاری',
  admin: 'مدیریت',
  'trading-management': 'برنامه معاملات',
};

export function DashboardTopbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const canSearchCustomers = hasPermission(user?.permissions, 'customer.read');
  const crumbs = pathname.split('/').filter(Boolean);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value || !canSearchCustomers) return;
    router.push(`/dashboard/customers?search=${encodeURIComponent(value)}`);
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="منو">
          <Menu className="h-5 w-5" />
        </Button>
        <nav aria-label="مسیر" className="hidden min-w-0 flex-1 text-sm text-muted-foreground md:block">
          {crumbs.map((crumb, index) => {
            const href = `/${crumbs.slice(0, index + 1).join('/')}`;
            const label = LABELS[crumb] ?? crumb;
            const last = index === crumbs.length - 1;
            return (
              <span key={href}>
                {index > 0 ? <span className="px-1">/</span> : null}
                {last ? (
                  <span className="font-medium text-foreground">{label}</span>
                ) : (
                  <Link href={href} className="hover:text-foreground">
                    {label}
                  </Link>
                )}
              </span>
            );
          })}
        </nav>
        {canSearchCustomers ? (
          <form onSubmit={onSearch} className="flex flex-1 items-center gap-2 md:max-w-xs md:flex-none">
            <label className="sr-only" htmlFor="global-search">
              جستجوی مشتری
            </label>
            <div className="relative w-full">
              <Search className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                id="global-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="جستجوی مشتری"
                className="h-9 w-full rounded-md border bg-background pr-9 pl-3 text-sm"
              />
            </div>
          </form>
        ) : (
          <div className="flex-1" />
        )}
        <Link href="/dashboard/notifications" aria-label="اعلان‌ها" className="rounded-md p-2 hover:bg-muted">
          <Bell className="h-5 w-5" />
        </Link>
        <div className="hidden text-left sm:block">
          <p className="text-xs text-muted-foreground">کاربر جاری</p>
          <p className="text-sm font-medium">
            <MobileNumber value={user?.mobile} />
          </p>
        </div>
      </div>
    </header>
  );
}
