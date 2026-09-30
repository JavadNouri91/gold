import type { BadgeProps } from '@/components/ui/badge';
import type { KycPhase } from '@/lib/api';

export interface KycSummaryBadge {
  label: string;
  variant: NonNullable<BadgeProps['variant']>;
  className?: string;
}

/** Maps the existing KYC phase to the summary badge. No new statuses. */
export function kycSummaryBadge(phase: KycPhase): KycSummaryBadge {
  switch (phase) {
    case 'VERIFIED':
      return { label: 'تأیید شده', variant: 'green' };
    case 'SUBMITTED':
      return { label: 'در انتظار بررسی', variant: 'yellow' };
    case 'UNDER_REVIEW':
      return { label: 'در حال بررسی', variant: 'yellow' };
    case 'NEEDS_CORRECTION':
      return { label: 'نیازمند اصلاح', variant: 'yellow', className: 'bg-orange-100 text-orange-800' };
    case 'REJECTED':
      return { label: 'رد شده', variant: 'red' };
    case 'NOT_STARTED':
    case 'IN_PROGRESS':
      return { label: 'تکمیل نشده', variant: 'gray' };
    default:
      return { label: 'تکمیل نشده', variant: 'gray' };
  }
}
