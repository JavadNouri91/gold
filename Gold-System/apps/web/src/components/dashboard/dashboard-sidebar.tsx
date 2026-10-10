'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { visibleNav } from '@/lib/nav';
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
                return (
                  <SidebarNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    iconClassName={staffIconTint(groupIndex * 3 + itemIndex)}
                    active={active}
                    onNavigate={onClose}
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
