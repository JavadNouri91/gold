'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PrintButton({
  className,
  size = 'sm',
  disabled = false,
}: {
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={disabled}
      className={cn(
        'gap-2 border-gold-300 text-gold-800 hover:bg-gold-50 print:hidden',
        className,
      )}
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" aria-hidden />
      چاپ
    </Button>
  );
}
