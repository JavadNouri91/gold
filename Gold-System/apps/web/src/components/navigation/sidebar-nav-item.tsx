'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SidebarNavItemProps = {
  label: string;
  description?: string;
  icon: LucideIcon;
  iconClassName?: string;
  active?: boolean;
  onNavigate?: () => void;
} & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
);

const BASE_CLASS =
  'group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500';

export function SidebarNavItem({
  label,
  description,
  icon: Icon,
  iconClassName,
  active = false,
  href,
  onClick,
  onNavigate,
}: SidebarNavItemProps) {
  const className = cn(
    BASE_CLASS,
    active
      ? 'border-r-4 border-gold-500 bg-[#FFF4D6] text-gold-800'
      : 'border-r-4 border-transparent text-slate-800 hover:bg-slate-50',
  );

  const content = (
    <>
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-gold-100 text-gold-700' : iconClassName ?? 'bg-slate-100 text-slate-600',
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-sm font-semibold',
            active ? 'text-gold-800' : 'text-slate-800',
          )}
        >
          {label}
        </span>
        {description ? (
          <span
            className={cn(
              'mt-0.5 block truncate text-[11px]',
              active ? 'text-gold-700/80' : 'text-muted-foreground',
            )}
          >
            {description}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        onNavigate?.();
      }}
      className={className}
    >
      {content}
    </button>
  );
}

/** Soft icon tile tints for staff nav, cycled by group index. */
export const STAFF_ICON_TINTS = [
  'bg-amber-50 text-amber-700',
  'bg-sky-50 text-sky-700',
  'bg-emerald-50 text-emerald-700',
  'bg-violet-50 text-violet-700',
  'bg-orange-50 text-orange-700',
  'bg-rose-50 text-rose-700',
  'bg-indigo-50 text-indigo-700',
] as const;

export function staffIconTint(index: number): string {
  return STAFF_ICON_TINTS[index % STAFF_ICON_TINTS.length]!;
}
