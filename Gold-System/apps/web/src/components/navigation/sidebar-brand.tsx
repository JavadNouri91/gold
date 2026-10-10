'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SidebarBrand({
  subtitle,
  onClose,
}: {
  subtitle: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start gap-2 px-4 pt-4 pb-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-[#FFFBF5] px-3 py-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-100 text-lg"
          aria-hidden
        >
          🟡
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold text-slate-800">سامانه طلا</p>
          <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="mt-1 shrink-0 lg:hidden"
        onClick={onClose}
        aria-label="بستن"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
