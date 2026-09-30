'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function InboxSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center lg:p-6">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="بستن" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-sheet-title"
        tabIndex={-1}
        className="relative flex max-h-[88vh] w-full flex-col rounded-t-2xl bg-white shadow-xl outline-none lg:max-h-[80vh] lg:max-w-lg lg:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
          <h2 id="inbox-sheet-title" className="text-base font-bold text-[#202124]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? <div className="border-t border-[#E5E7EB] px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
