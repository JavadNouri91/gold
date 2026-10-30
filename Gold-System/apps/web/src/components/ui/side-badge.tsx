import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react';
import { ORDER_SIDE_LABELS, cn } from '@/lib/utils';

/**
 * Buy/sell side badge shared by staff and portal tables.
 *
 * Orders created without a side stay unclassified — they are never relabeled
 * as خرید or فروش (docs/21-business-decisions.md, customer activity rules).
 */
export function SideBadge({
  side,
  className,
  showIcon = false,
}: {
  side?: 'BUY' | 'SELL' | string | null;
  className?: string;
  showIcon?: boolean;
}) {
  const label = side ? ORDER_SIDE_LABELS[side] : undefined;

  if (!label) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)}>—</span>
    );
  }

  const isBuy = side === 'BUY';
  const Icon = isBuy ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold',
        isBuy
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
        className,
      )}
    >
      {showIcon ? <Icon className="h-3 w-3" aria-hidden /> : null}
      {label}
    </span>
  );
}

/** Compact dash marker used when a row has no side at all. */
export function SidePlaceholder() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Minus className="h-3 w-3" aria-hidden />
      نامشخص
    </span>
  );
}
