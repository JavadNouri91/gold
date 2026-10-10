'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SidebarShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="بستن منو"
          onClick={onClose}
        />
      ) : null}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l border-slate-100 bg-white shadow-[-4px_0_24px_rgba(15,23,42,0.06)] transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
      >
        {children}
      </aside>
    </>
  );
}
