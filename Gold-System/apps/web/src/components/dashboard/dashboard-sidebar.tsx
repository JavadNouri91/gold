'use client';

import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { visibleNav } from '@/lib/nav';
import { hasPermission } from '@/lib/permissions';
import { internalKycApi, internalOrdersApi, internalPaymentsApi, staffPickupsApi } from '@/lib/internal-api';
import { toPersianDigits } from '@/lib/utils';
import { SidebarShell } from '@/components/navigation/sidebar-shell';
import { SidebarBrand } from '@/components/navigation/sidebar-brand';
import { SidebarNavItem, staffIconTint } from '@/components/navigation/sidebar-nav-item';
import { SidebarLogout } from '@/components/navigation/sidebar-logout';

export function DashboardSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const items = visibleNav(user?.permissions);
  const groups = Array.from(new Set(items.map((item) => item.group)));

  const canReviewKyc =
    hasPermission(user?.permissions, 'kyc.review') &&
    hasPermission(user?.permissions, 'customer.read');
  const { data: kycPending } = useSWR(
    canReviewKyc ? ['kyc-pending-count'] : null,
    () => internalKycApi.pendingCount(),
    { refreshInterval: 60_000 },
  );
  const kycPendingCount = kycPending?.awaiting ?? 0;
  const { data: orderSummary } = useSWR(
    hasPermission(user?.permissions, 'order.read') ? ['orders-pending-summary'] : null,
    () => internalOrdersApi.summary(),
    { refreshInterval: 30_000 },
  );
  const buyCount = orderSummary?.pendingBuyOrdersCount ?? 0;
  const sellCount = orderSummary?.pendingSellOrdersCount ?? 0;
  const { data: pendingPickups } = useSWR(
    hasPermission(user?.permissions, 'pickup.read') ? ['pickups-pending-count'] : null,
    () => staffPickupsApi.list({ status: 'REQUESTED', limit: 1, offset: 0 }),
    { refreshInterval: 30_000 },
  );
  const pendingPickupsCount = pendingPickups?.meta.total ?? 0;
  const { data: paymentSummary } = useSWR(
    hasPermission(user?.permissions, 'payment.read') ? ['payments-staff-summary'] : null,
    () => internalPaymentsApi.staffSummary(),
    { refreshInterval: 30_000 },
  );
  const pendingDepositsCount = paymentSummary?.deposits.pendingCount ?? 0;
  const pendingWithdrawalsCount = paymentSummary?.withdrawals.pendingCount ?? 0;
  const kycPendingLabel = kycPendingCount > 99 ? '۹۹+' : toPersianDigits(String(kycPendingCount));

  return (
    <SidebarShell open={open} onClose={onClose}>
      <SidebarBrand subtitle="داشبورد داخلی" onClose={onClose} />

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3" aria-label="منوی داخلی">
        {groups.map((group, groupIndex) => (
          <div key={group} className="space-y-1">
            <p className="px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">{group}</p>
            {items
              .filter((item) => item.group === group)
              .map((item, itemIndex) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const isKyc = item.href === '/dashboard/kyc';
                return (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    iconClassName={staffIconTint(groupIndex * 3 + itemIndex)}
                    active={active}
                    onNavigate={onClose}
                    trailing={
                      item.href === '/dashboard/orders' && (buyCount > 0 || sellCount > 0) ? (
                        <div className="ms-auto flex shrink-0 items-center gap-1.5">
                          {buyCount > 0 && (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white shadow-sm"
                              aria-label={`${buyCount.toLocaleString('fa-IR')} سفارش خرید در انتظار بررسی`}
                            >
                              {buyCount.toLocaleString('fa-IR')}
                            </span>
                          )}
                          {sellCount > 0 && (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow-sm"
                              aria-label={`${sellCount.toLocaleString('fa-IR')} سفارش فروش در انتظار بررسی`}
                            >
                              {sellCount.toLocaleString('fa-IR')}
                            </span>
                          )}
                        </div>
                      ) : item.href === '/dashboard/payments' &&
                        (pendingDepositsCount > 0 || pendingWithdrawalsCount > 0) ? (
                        <div className="ms-auto flex shrink-0 items-center gap-1.5">
                          {pendingDepositsCount > 0 && (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white shadow-sm"
                              title={`${pendingDepositsCount.toLocaleString('fa-IR')} واریز در انتظار تأیید`}
                              aria-label={`${pendingDepositsCount.toLocaleString('fa-IR')} واریز در انتظار تأیید`}
                            >
                              {pendingDepositsCount.toLocaleString('fa-IR')}
                            </span>
                          )}
                          {pendingWithdrawalsCount > 0 && (
                            <span
                              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white shadow-sm"
                              title={`${pendingWithdrawalsCount.toLocaleString('fa-IR')} برداشت در انتظار تأیید`}
                              aria-label={`${pendingWithdrawalsCount.toLocaleString('fa-IR')} برداشت در انتظار تأیید`}
                            >
                              {pendingWithdrawalsCount.toLocaleString('fa-IR')}
                            </span>
                          )}
                        </div>
                      ) : item.href === '/dashboard/pickups' && pendingPickupsCount > 0 ? (
                        <span
                          className="ms-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-amber-600 px-1.5 text-[11px] font-bold text-white shadow-sm"
                          aria-label={`${pendingPickupsCount.toLocaleString('fa-IR')} درخواست تحویل حضوری در انتظار بررسی`}
                        >
                          {pendingPickupsCount.toLocaleString('fa-IR')}
                        </span>
                      ) : isKyc && kycPendingCount > 0 ? (
                        <span
                          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 px-2 text-[11px] font-bold leading-none text-white"
                          title={`${kycPendingLabel} پرونده در انتظار بررسی`}
                          aria-label={`${kycPendingLabel} پرونده در انتظار بررسی`}
                        >
                          {kycPendingLabel}
                        </span>
                      ) : null
                    }
                  />
                );
              })}
          </div>
        ))}
      </nav>

      <SidebarLogout
        onClick={() =>
          void logout().then(() => {
            window.location.href = '/dashboard/login';
          })
        }
      />
    </SidebarShell>
  );
}
