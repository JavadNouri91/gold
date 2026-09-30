'use client';

import { Suspense, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Headphones, Menu } from 'lucide-react';
import useSWR from 'swr';
import { customerApi, type CustomerProfile } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { UserStatusBadge } from '@/components/portal/user-status-badge';
import { AssetsHeader } from '@/components/portal/assets/assets-header';
import { CreditHeader } from '@/components/portal/credit/credit-header';
import { NotificationBell } from '@/components/portal/notifications/notification-bell';

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
      <div className="flex items-start justify-between gap-3 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 h-11 w-11 shrink-0 lg:hidden"
            onClick={onMenu}
            aria-label="منو"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            {isAssets ? (
              <AssetsHeader />
            ) : isCredit ? (
              <CreditHeader />
            ) : isNewOrder ? (
              <Suspense
                fallback={
                  <h1 className="truncate text-base font-bold text-[#202124] md:text-lg">خرید طلا</h1>
                }
              >
                <NewOrderHeading customer={customer} fullName={fullName} />
              </Suspense>
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
          <NotificationBell />
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            aria-label="پشتیبانی"
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <Headphones className="h-4 w-4" />
            <span className="hidden sm:inline">پشتیبانی</span>
          </button>
        </div>
      </div>

      <Modal open={supportOpen} onClose={() => setSupportOpen(false)} title="پشتیبانی">
        <p className="text-sm text-muted-foreground leading-7">
          برای پیگیری سفارش، پرداخت و احراز هویت از بخش اعلان‌ها و سفارش‌های خود استفاده کنید.
          درخواست اعتبار از صفحه اعتبار ثبت و توسط پشتیبانی بررسی می‌شود.
        </p>
        <div className="mt-5 flex justify-end">
          <Button variant="outline" onClick={() => setSupportOpen(false)}>
            بستن
          </Button>
        </div>
      </Modal>
    </header>
  );
}

function NewOrderHeading({
  customer,
  fullName,
}: {
  customer?: CustomerProfile;
  fullName: string;
}) {
  const side = useSearchParams().get('side');
  if (side === 'sell') {
    return (
      <>
        <h1 className="truncate text-base font-bold text-slate-800 md:text-lg">سلام {fullName} 👋</h1>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
          خوش آمدید، امروز فرصت خوبی برای معامله است.
        </p>
        <div className="mt-2">
          <UserStatusBadge type={customer?.type} status={customer?.status} />
        </div>
      </>
    );
  }

  return (
    <div className="min-w-0">
      <h1 className="truncate text-base font-bold text-[#202124] md:text-lg">خرید طلا</h1>
      <p className="mt-0.5 hidden text-xs text-[#6B7280] lg:block lg:text-sm">
        خرید طلای آبشده با قیمت لحظه‌ای
      </p>
    </div>
  );
}
