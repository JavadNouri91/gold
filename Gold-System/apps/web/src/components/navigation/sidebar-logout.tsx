'use client';

import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SidebarLogout({
  onClick,
  footer,
  className,
}: {
  onClick: () => void;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-auto border-t border-slate-100 px-4 py-4', className)}>
      {footer ? <div className="mb-2 truncate px-1 text-xs text-muted-foreground">{footer}</div> : null}
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden />
        خروج از حساب
      </button>
    </div>
  );
}
