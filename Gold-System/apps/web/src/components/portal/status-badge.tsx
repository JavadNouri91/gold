'use client';
import { Badge } from '@/components/ui/badge';
import { getStatusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  label: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const color = getStatusColor(status);
  const variantMap: Record<string, 'green' | 'red' | 'yellow' | 'gray'> = {
    green: 'green',
    red: 'red',
    yellow: 'yellow',
    gray: 'gray',
  };
  return (
    <Badge variant={variantMap[color] ?? 'gray'} className={className}>
      {label}
    </Badge>
  );
}
