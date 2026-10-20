'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Landmark, Lock, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ProfileTabId = 'personal' | 'kyc' | 'banks' | 'security';

const TABS: { id: ProfileTabId; label: string; icon: LucideIcon; hashes: string[] }[] = [
  { id: 'personal', label: 'اطلاعات شخصی', icon: UserRound, hashes: ['personal', ''] },
  { id: 'kyc', label: 'مدارک هویتی (KYC)', icon: ShieldCheck, hashes: ['kyc'] },
  { id: 'banks', label: 'حساب‌های بانکی', icon: Landmark, hashes: ['banks'] },
  { id: 'security', label: 'امنیت و تنظیمات', icon: Lock, hashes: ['security', 'settings'] },
];

function tabFromHash(hash: string): ProfileTabId {
  const raw = hash.replace(/^#/, '').toLowerCase();
  const match = TABS.find((tab) => tab.hashes.includes(raw));
  return match?.id ?? 'personal';
}

export function ProfileTabs({
  panels,
}: {
  panels: Record<ProfileTabId, ReactNode>;
}) {
  const [active, setActive] = useState<ProfileTabId>(() =>
    typeof window !== 'undefined' ? tabFromHash(window.location.hash) : 'personal',
  );

  useEffect(() => {
    const sync = () => setActive(tabFromHash(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const select = useCallback((id: ProfileTabId) => {
    setActive(id);
    const next = id === 'personal' ? '#personal' : `#${id}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${next}`);
    }
  }, []);

  return (
    <div className="space-y-4">
      <nav
        className="sticky top-0 z-10 -mx-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white/90 shadow-sm backdrop-blur"
        aria-label="بخش‌های پروفایل"
      >
        <ul className="flex min-w-max gap-1 px-1.5 pt-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = active === tab.id;
            return (
              <li key={tab.id} className="relative">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => select(tab.id)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-t-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-gold-50 text-gold-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
                <span
                  className={cn(
                    'absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-colors',
                    isActive ? 'bg-gold-500' : 'bg-transparent',
                  )}
                  aria-hidden
                />
              </li>
            );
          })}
        </ul>
      </nav>

      {TABS.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          hidden={active !== tab.id}
          className={cn(active === tab.id && 'animate-in fade-in-0 duration-200')}
        >
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}