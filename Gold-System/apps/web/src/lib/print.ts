import { useEffect } from 'react';

/**
 * Sets the default paper size while the calling view is mounted.
 *
 * `@page` cannot be scoped to a selector, so the rule is injected only while
 * the receipt view is on screen and removed on unmount. The named page in
 * `globals.css` (`@page trade-receipt`) stays the source of truth for the
 * receipt sheet; this keeps browsers without named-page support on A5 too.
 */
export function usePrintPageSize(size: string | null, margin = '8mm') {
  useEffect(() => {
    if (!size) return;
    const style = document.createElement('style');
    style.dataset.printPageSize = size;
    style.textContent = `@media print { @page { size: ${size}; margin: ${margin}; } }`;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [size, margin]);
}
