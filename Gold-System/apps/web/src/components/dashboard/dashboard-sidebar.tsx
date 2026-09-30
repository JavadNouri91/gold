'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { visibleNav } from '@/lib/nav';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';

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
    <>
      {open ? (
        <button
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="بستن منو"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <p className="font-bold text-gold-800">سامانه طلا</p>
            <p className="text-xs text-muted-foreground">داشبورد داخلی</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose} aria-label="بستن">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="منوی داخلی">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-3 pb-1 text-xs font-semibold text-muted-foreground">{group}</p>
              <div className="space-y-1">
                {items
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                          active
                            ? 'bg-gold-100 text-gold-800'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <p className="truncate px-3 pb-2 text-xs text-muted-foreground">
            <MobileNumber value={user?.mobile} />
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 text-red-600 hover:bg-red-50"
            onClick={() => void logout().then(() => {
              window.location.href = '/dashboard/login';
            })}
          >
            <LogOut className="h-4 w-4" />
            خروج
          </Button>
        </div>
      </aside>
    </>
  );
}
