'use client';

import { IranianBank } from 'react-iranian-bank-logo';
import { ibanBankLogoName, ibanBankName } from '@/lib/iban-bank';
import { cn } from '@/lib/utils';

export function BankLogo({
  iban,
  size = 'md',
  className,
}: {
  iban: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const label = ibanBankName(iban) ?? 'بانک';
  const logoName = ibanBankLogoName(iban);
  const px = size === 'sm' ? 36 : 44;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        className,
      )}
      aria-label={label}
      title={label}
    >
      <IranianBank name={logoName} size={px} alt={label} />
    </span>
  );
}
