import { toLatinDigits } from '@/lib/utils';

export interface IbanBankMark {
  name: string;
  short: string;
  className: string;
}

/** Three-digit bank identifier after `IR` + two IBAN check digits. */
export const IBAN_BANK_MARKS: Record<string, IbanBankMark> = {
  '010': { name: 'بانک مرکزی', short: 'مرکزی', className: 'bg-[#0B5C3A] text-white' },
  '011': { name: 'بانک صنعت و معدن', short: 'صنعت', className: 'bg-[#1D4F91] text-white' },
  '012': { name: 'بانک ملت', short: 'ملت', className: 'bg-[#B91C1C] text-white' },
  '013': { name: 'بانک رفاه کارگران', short: 'رفاه', className: 'bg-[#1E40AF] text-white' },
  '014': { name: 'بانک مسکن', short: 'مسکن', className: 'bg-[#EA580C] text-white' },
  '015': { name: 'بانک سپه', short: 'سپه', className: 'bg-[#4D7C0F] text-white' },
  '016': { name: 'بانک کشاورزی', short: 'کشاورزی', className: 'bg-[#15803D] text-white' },
  '017': { name: 'بانک ملی ایران', short: 'ملی', className: 'bg-[#1E3A5F] text-white' },
  '018': { name: 'بانک تجارت', short: 'تجارت', className: 'bg-[#0F3D6E] text-white' },
  '019': { name: 'بانک صادرات', short: 'صادرات', className: 'bg-[#9F1239] text-white' },
  '020': { name: 'بانک توسعه صادرات', short: 'توسعه', className: 'bg-[#047857] text-white' },
  '021': { name: 'پست بانک ایران', short: 'پست', className: 'bg-[#CA8A04] text-white' },
  '022': { name: 'بانک توسعه تعاون', short: 'تعاون', className: 'bg-[#0F766E] text-white' },
  '052': { name: 'موسسه اعتباری قوامین', short: 'قوامین', className: 'bg-[#166534] text-white' },
  '053': { name: 'بانک کارآفرین', short: 'کارآفرین', className: 'bg-[#C2410C] text-white' },
  '054': { name: 'بانک پارسیان', short: 'پارسیان', className: 'bg-[#92400E] text-white' },
  '055': { name: 'بانک اقتصادنوین', short: 'نوین', className: 'bg-[#6D28D9] text-white' },
  '056': { name: 'بانک سامان', short: 'سامان', className: 'bg-[#1D4ED8] text-white' },
  '057': { name: 'بانک پاسارگاد', short: 'پاسارگاد', className: 'bg-[#B45309] text-white' },
  '058': { name: 'بانک سرمایه', short: 'سرمایه', className: 'bg-[#1E40AF] text-white' },
  '059': { name: 'بانک سینا', short: 'سینا', className: 'bg-[#0E7490] text-white' },
  '060': { name: 'قرض‌الحسنه مهر ایران', short: 'مهر', className: 'bg-[#15803D] text-white' },
  '061': { name: 'بانک شهر', short: 'شهر', className: 'bg-[#0F766E] text-white' },
  '062': { name: 'بانک آینده', short: 'آینده', className: 'bg-[#D97706] text-white' },
  '063': { name: 'بانک انصار', short: 'انصار', className: 'bg-[#166534] text-white' },
  '064': { name: 'بانک گردشگری', short: 'گردشگری', className: 'bg-[#EA580C] text-white' },
  '065': { name: 'بانک حکمت ایرانیان', short: 'حکمت', className: 'bg-[#1E3A8A] text-white' },
  '066': { name: 'بانک دی', short: 'دی', className: 'bg-[#2563EB] text-white' },
  '069': { name: 'بانک ایران زمین', short: 'ایران‌زمین', className: 'bg-[#047857] text-white' },
  '070': { name: 'قرض‌الحسنه رسالت', short: 'رسالت', className: 'bg-[#15803D] text-white' },
  '075': { name: 'موسسه اعتباری ملل', short: 'ملل', className: 'bg-[#1D4ED8] text-white' },
  '079': { name: 'بانک مهر اقتصاد', short: 'مهر', className: 'bg-[#166534] text-white' },
  '080': { name: 'بانک خاورمیانه', short: 'خاورمیانه', className: 'bg-[#1E40AF] text-white' },
};

/** @deprecated use IBAN_BANK_MARKS[code].name */
export const IBAN_BANK_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(IBAN_BANK_MARKS).map(([code, mark]) => [code, mark.name]),
);

/** IBAN digits after the `IR` prefix (24 digits for Iranian accounts). */
export function ibanDigits(value: string): string {
  const upper = toLatinDigits(value).toUpperCase().replace(/\s/g, '');
  const withoutPrefix = upper.startsWith('IR') ? upper.slice(2) : upper;
  return withoutPrefix.replace(/\D/g, '');
}

/** Bank code: three digits after the two IBAN check digits. */
export function ibanBankCode(value: string): string | null {
  const digits = ibanDigits(value);
  if (digits.length < 5) return null;
  return digits.slice(2, 5);
}

export function ibanBankMark(value: string): IbanBankMark | null {
  const code = ibanBankCode(value);
  if (!code) return null;
  return IBAN_BANK_MARKS[code] ?? null;
}

export function ibanBankName(value: string): string | null {
  return ibanBankMark(value)?.name ?? null;
}

/** `name` prop for `react-iranian-bank-logo`. */
export const IBAN_BANK_LOGO_NAMES: Record<string, string> = {
  '010': 'ir-markazi',
  '011': 'ir-sanat-madan',
  '012': 'ir-mellat',
  '013': 'ir-refah',
  '014': 'ir-maskan',
  '015': 'ir-sepah',
  '016': 'ir-keshavarzi',
  '017': 'ir-melli',
  '018': 'ir-tejarat',
  '019': 'ir-saderat',
  '020': 'ir-tose-saderat-iran',
  '021': 'ir-post-bank',
  '022': 'ir-tose-taawon',
  '053': 'ir-karafarin',
  '054': 'ir-parsian',
  '055': 'ir-eghtesad-novin',
  '056': 'ir-saman',
  '057': 'ir-pasargad',
  '058': 'ir-sarmaye',
  '059': 'ir-sina',
  '060': 'ir-mehr',
  '061': 'ir-shahr',
  '064': 'ir-gardeshgari',
  '066': 'ir-day',
  '069': 'ir-iranzamin',
  '070': 'ir-resalat',
  '080': 'ir-khavar-miane',
};

export function ibanBankLogoName(value: string): string {
  const code = ibanBankCode(value);
  if (!code) return 'unknown';
  return IBAN_BANK_LOGO_NAMES[code] ?? 'unknown';
}

/**
 * Display groups after `IR`: 2 check digits, then fours, then a final pair
 * when the 24-digit body is complete. Example: `12 0560 0842 0000 1234 5678 90`.
 */
export function formatIbanDigitGroups(digits: string): string {
  const d = ibanDigits(digits).slice(0, 24);
  if (!d) return '';
  const check = d.slice(0, 2);
  const rest = d.slice(2);
  const groups = [check];
  for (let i = 0; i < rest.length; i += 4) {
    groups.push(rest.slice(i, i + 4));
  }
  return groups.join(' ');
}

/** Full display, e.g. `IR12 0560 0842 0000 1234 5678 90`. */
export function formatIbanDisplay(value: string): string {
  const grouped = formatIbanDigitGroups(value);
  return grouped ? `IR${grouped}` : 'IR';
}
