'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { toPersianDigits } from '@/lib/utils';

export function NotificationBell() {
  const { data } = useSWR('notifications/summary', () => notificationsApi.summary(), {
    revalidateOnFocus: true,
  });
  const unread = data?.unread ?? 0;
  const label =
    unread > 0 ? `اعلان‌ها، ${toPersianDigits(String(unread))} خوانده‌نشده` : 'اعلان‌ها';
  const badge = unread > 99 ? '۹۹+' : toPersianDigits(String(unread));

  return (
    <Link
      href="/portal/notifications"
      aria-label={label}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm text-slate-600 hover:bg-slate-50"
    >
      <span className="relative">
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -start-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[10px] font-bold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="hidden sm:inline">اعلان‌ها</span>
    </Link>
  );
}
