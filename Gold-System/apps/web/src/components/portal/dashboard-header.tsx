'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Headphones, Menu, ShieldCheck, UserRound } from 'lucide-react';
import useSWR from 'swr';
import { customerApi, fetchBlob, type CustomerProfile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { UserStatusBadge } from '@/components/portal/user-status-badge';
import { AssetsHeader } from '@/components/portal/assets/assets-header';
import { CreditHeader } from '@/components/portal/credit/credit-header';
import { NotificationBell } from '@/components/portal/notifications/notification-bell';
import { PortalSupportModal } from '@/components/portal/portal-support-modal';
import { RialBalanceCard } from '@/components/portal/rial-balance-card';

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
    ? `${customer.firstName} ${customer.lastName}`
    : customerError
      ? 'کاربر'
      : '…';

  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="flex items-start justify-between gap-2 px-4 py-3 sm:gap-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 h-11 w-11 shrink-0 lg:hidden"
            onClick={onMenu}
            aria-label="منو"
          >
            <Menu className="h-5 w-5" />
          </Button>
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
                    مدیریت اطلاعات شخصی و حساب کاربری
                  </p>
                </div>
                <UserStatusBadge type={customer?.type} status={customer?.status} />
              </div>
            ) : isKyc ? (
              <>
                <h1 className="truncate text-base font-bold text-[#202124] lg:hidden">
                  احراز هویت (KYC)
                </h1>
                <div className="hidden lg:block">
                  <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                    سلام {fullName} 👋
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                    خوش آمدید، امروز فرصت خوبی برای معامله است.
                  </p>
                  <div className="mt-2">
                    <UserStatusBadge type={customer?.type} status={customer?.status} />
                  </div>
                </div>
              </>
            ) : isTrades ? (
              <>
                <h1 className="truncate text-base font-bold text-[#202124] lg:hidden">معاملات من</h1>
                <div className="hidden lg:block">
                  <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                    سلام {fullName} 👋
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                    خوش آمدید، امروز فرصت خوبی برای معامله است.
                  </p>
                  <div className="mt-2">
                    <UserStatusBadge type={customer?.type} status={customer?.status} />
                  </div>
                </div>
              </>
            ) : isPayments ? (
              <>
                <h1 className="truncate text-xl font-bold text-[#202124] lg:hidden">پرداخت‌های من</h1>
                <div className="hidden lg:block">
                  <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                    سلام {fullName} 👋
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                    خوش آمدید، امروز فرصت خوبی برای معامله است.
                  </p>
                  <div className="mt-2">
                    <UserStatusBadge type={customer?.type} status={customer?.status} />
                  </div>
                </div>
              </>
            ) : isNotifications ? (
              <>
                <h1 className="truncate text-base font-bold text-[#202124] lg:hidden">اعلان‌های من</h1>
                <div className="hidden lg:block">
                  <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                    سلام {fullName} 👋
                  </h1>
                  <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                    خوش آمدید، امروز فرصت خوبی برای معامله است.
                  </p>
                  <div className="mt-2">
                    <UserStatusBadge type={customer?.type} status={customer?.status} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">
                  سلام {fullName} 👋
                </h1>
                <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                  خوش آمدید، امروز فرصت خوبی برای معامله است.
                </p>
                <div className="mt-2">
                  <UserStatusBadge type={customer?.type} status={customer?.status} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <RialBalanceCard />
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
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="منوی پروفایل"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D99A00] focus-visible:ring-offset-2"
      >
        <ProfileAvatar customer={customer} name={name} size="h-9 w-9" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="منوی پروفایل"
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-2xl border border-slate-100 bg-white p-2 text-right shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
        >
          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3">
            <ProfileAvatar customer={customer} name={name} size="h-11 w-11" />
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
            icon={UserRound} label="پروفایل من" onSelect={() => setOpen(false)} />
          <MenuLink href="/portal/profile#security" icon={ShieldCheck} label="امنیت حساب" onSelect={() => setOpen(false)} />
          <MenuLink href="/portal/notifications" icon={Bell} label="تنظیمات اعلان‌ها" onSelect={() => setOpen(false)} />
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

function ProfileAvatar({
  customer,
  name,
  size,
}: {
  customer?: CustomerProfile;
  name: string;
  size: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!customer?.hasAvatar) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchBlob('/customers/me/avatar')
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [customer?.hasAvatar, customer?.updatedAt]);

  if (src) return <img src={src} alt="" className={`${size} rounded-full object-cover ring-1 ring-[#D99A00]/40`} />;
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('');
  return (
    <span className={`${size} flex items-center justify-center rounded-full bg-[#FFF4D6] text-sm font-bold text-[#B77900] ring-1 ring-[#D99A00]/40`}>
      {initials || '؟'}
    </span>
  );
}

function NewOrderHeading() {
  return (
    <div className="min-w-0">
      <h1 className="truncate text-base font-bold text-[#202124] md:text-lg">خرید و فروش طلا</h1>
      <p className="mt-0.5 hidden text-xs text-[#6B7280] lg:block lg:text-sm">
        خرید و فروش طلای آبشده با قیمت لحظه‌ای
      </p>
    </div>
  );
}
