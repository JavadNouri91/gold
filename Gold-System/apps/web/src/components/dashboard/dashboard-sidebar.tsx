'use client';

import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { visibleNav } from '@/lib/nav';
import { hasPermission } from '@/lib/permissions';
import { internalKycApi } from '@/lib/internal-api';
import { toPersianDigits } from '@/lib/utils';
import { MobileNumber } from '@/components/ui/mobile-input';
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
                      isKyc && kycPendingCount > 0 ? (
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
        footer={user ? <MobileNumber value={user.mobile} /> : null}
      />
    </SidebarShell>
  );
}
