import Link from 'next/link';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  href?: string;
}) {
  const card = (
    <Card
      className={cn(
        'h-full',
        href && 'transition-colors group-hover:border-gold-400 group-hover:bg-gold-50/60',
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums" dir="ltr">
              {value}
            </p>
            {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <div className="flex items-center gap-1 text-gold-600">
            {Icon ? <Icon className="h-5 w-5" aria-hidden="true" /> : null}
            {href ? <ChevronLeft className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
    >
      {card}
    </Link>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
