'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Headphones, LogOut, Menu, ShieldCheck, UserRound } from 'lucide-react';
import useSWR from 'swr';
import { customerApi, type CustomerProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { CustomerAvatar } from '@/components/portal/customer-avatar';
import { UserStatusBadge } from '@/components/portal/user-status-badge';
import { AssetsHeader } from '@/components/portal/assets/assets-header';
import { CreditHeader } from '@/components/portal/credit/credit-header';
import { NotificationBell } from '@/components/portal/notifications/notification-bell';
import { PortalSupportModal } from '@/components/portal/portal-support-modal';
import { RialBalanceCard } from '@/components/portal/rial-balance-card';
import { ThemeCycleButton } from '@/components/theme-toggle';

export function DashboardHeader({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const isProfile = pathname === '/portal/profile';
  const isAssets = pathname === '/portal/assets' || pathname.startsWith('/portal/assets/');
  const isCredit = pathname === '/portal/credit' || pathname.startsWith('/portal/credit/');
  const isKyc = pathname === '/portal/kyc' || pathname.startsWith('/portal/kyc/');
  const isNewOrder = pathname === '/portal/orders/new';
  const isTrades = pathname === '/portal/trades';
  const isPayments = pathname === '/portal/payments' || pathname.startsWith('/portal/payments/');
  const isNotifications =
    pathname === '/portal/notifications' || pathname.startsWith('/portal/notifications/');
  const { data: customer, error: customerError } = useSWR('customer/me', () => customerApi.getMe());
  const [supportOpen, setSupportOpen] = useState(false);
  const fullName = customer
    ? `${customer.firstName} ${customer.lastName}`.trim()
    : customerError
      ? 'کاربر'
      : '…';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
      {/* Mobile chrome — matches reference: balance + bell + menu, then greeting */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={onMenu}
              aria-label="منو"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <NotificationBell />
          </div>
          <RialBalanceCard className="min-w-0" />
        </div>
        <div className="flex items-start gap-3 px-4 pb-3">
          <CustomerAvatar customer={customer} name={fullName} size="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-[#172033]">سلام {fullName} 👋</h1>
            <div className="mt-2">
              <UserStatusBadge type={customer?.type} status={customer?.status} />
            </div>
          </div>
        </div>
      </div>

      {/* Desktop header — preserve existing route-aware layout */}
      <div className="hidden items-start justify-between gap-3 px-6 py-3 lg:flex">
        <div className="min-w-0 flex-1">
          {isAssets ? (
            <AssetsHeader />
          ) : isCredit ? (
            <CreditHeader />
          ) : isNewOrder ? (
            <NewOrderHeading />
          ) : isProfile ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                  پروفایل من
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                  مدیریت اطلاعات شخصی، امنیت و تنظیمات حساب
                </p>
              </div>
              <UserStatusBadge type={customer?.type} status={customer?.status} />
            </div>
          ) : isKyc || isTrades || isPayments || isNotifications ? (
            <>
              <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                سلام {fullName} 👋
              </h1>
              <div className="mt-2">
                <UserStatusBadge type={customer?.type} status={customer?.status} />
              </div>
            </>
          ) : (
            <>
              <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                سلام {fullName} 👋
              </h1>
              <div className="mt-2">
                <UserStatusBadge type={customer?.type} status={customer?.status} />
              </div>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <RialBalanceCard />
          <ThemeCycleButton />
          <NotificationBell />
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            aria-label="پشتیبانی"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Headphones className="h-4 w-4" />
          </button>
          <ProfileMenu customer={customer} />
        </div>
      </div>

      <PortalSupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </header>
  );
}

function ProfileMenu({ customer }: { customer?: CustomerProfile }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLAnchorElement>(null);
  const name = customer ? `${customer.firstName} ${customer.lastName}`.trim() : 'کاربر';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const index = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
    items[(next + items.length) % items.length].focus();
  };

  return (
    <div ref={menuRef} className="relative flex h-11 items-center md:ml-2">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="منوی پروفایل"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00] focus-visible:ring-offset-2"
      >
        <CustomerAvatar customer={customer} name={name} size="h-9 w-9" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="منوی پروفایل"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-right shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
            <CustomerAvatar customer={customer} name={name} size="h-11 w-11" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{name}</p>
              <div className="mt-1">
                <UserStatusBadge type={customer?.type} status={customer?.status} />
              </div>
            </div>
          </div>
          <MenuLink
            ref={firstItemRef}
            href="/portal/profile"
            icon={UserRound}
            label="پروفایل من"
            onSelect={() => setOpen(false)}
          />
          <MenuLink
            href="/portal/profile#security"
            icon={ShieldCheck}
            label="امنیت حساب"
            onSelect={() => setOpen(false)}
          />
          <MenuLink
            href="/portal/notifications"
            icon={Bell}
            label="تنظیمات اعلان‌ها"
            onSelect={() => setOpen(false)}
          />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-3 rounded-xl border-t border-slate-100 px-3 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            خروج از حساب
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  onSelect,
  ref,
}: {
  href: string;
  icon: typeof UserRound;
  label: string;
  onSelect: () => void;
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={ref}
      href={href}
      role="menuitem"
      onClick={onSelect}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
    >
      <Icon className="h-4 w-4 text-slate-500" aria-hidden />
      {label}
    </Link>
  );
}

function NewOrderHeading() {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-base font-bold text-[#202124] md:text-lg">خرید و فروش طلا</h1>
      <p className="mt-0.5 text-xs text-[#6B7280] lg:text-sm">
        خرید و فروش طلای آبشده با قیمت لحظه‌ای
      </p>
    </div>
  );
}
