'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, Coins, Home, Receipt, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/portal/dashboard', label: 'خانه', icon: Home, exact: true },
  { href: '/portal/assets', label: 'دارایی', icon: Coins, exact: false },
  { href: '/portal/orders/new', label: 'خرید/فروش', icon: ArrowLeftRight, exact: false, center: true },
  { href: '/portal/trades', label: 'معاملات', icon: Receipt, exact: false },
  { href: '/portal/profile', label: 'پروفایل', icon: UserRound, exact: false },
] as const;

function isItemActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E5E7EB] bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5 items-end px-1 pt-1">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(pathname, item.href, item.exact);
          const center = 'center' in item && item.center;
          return (
            <li key={item.href} className="min-w-0">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 w-full flex-col items-center justify-end gap-0.5 overflow-hidden px-0.5 pb-2 text-[10px] font-medium leading-3',
                  active ? 'text-[#C8922E]' : 'text-[#6B7280]',
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center',
                    center
                      ? '-mt-4 h-12 w-12 rounded-full bg-[#C8922E] text-white shadow-md'
                      : 'h-6 w-6',
                    center && active && 'ring-2 ring-[#FFF4D6]',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                {center ? (
                  <span className="text-center" aria-hidden>
                    خرید
                    <br />
                    فروش
                  </span>
                ) : (
                  <span className="max-w-full truncate">{item.label}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
