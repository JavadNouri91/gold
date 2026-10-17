'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * Header icon labels are portaled to document.body so overflow-x-hidden on the
 * portal shell cannot clip them. Native title tooltips are avoided; they ignore Vazirmatn.
 */
export function HeaderHoverTip({
  content,
  tone = 'emerald',
  children,
}: {
  content: ReactNode;
  tone?: 'emerald' | 'amber';
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
  }, []);

  const show = () => {
    place();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex shrink-0 self-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={show}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) hide();
      }}
    >
      {children}
      {open
        ? createPortal(
            <span
              role="tooltip"
              style={{ top: coords.top, left: coords.left }}
              className={cn(
                'pointer-events-none fixed z-[80] w-max max-w-[14rem] -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-center font-sans text-[11px] font-medium leading-5 shadow-md',
                tone === 'emerald' ? 'bg-emerald-800 text-white' : 'bg-amber-800 text-white',
              )}
            >
              {content}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
