import { toLatinDigits } from './digits';

/** Three-digit bank identifier after `IR` + two IBAN check digits. */
export const IBAN_BANK_NAMES: Record<string, string> = {
  '010': 'بانک مرکزی',
  '011': 'بانک صنعت و معدن',
  '012': 'بانک ملت',
  '013': 'بانک رفاه کارگران',
  '014': 'بانک مسکن',
  '015': 'بانک سپه',
  '016': 'بانک کشاورزی',
  '017': 'بانک ملی ایران',
  '018': 'بانک تجارت',
  '019': 'بانک صادرات',
  '020': 'بانک توسعه صادرات',
  '021': 'پست بانک ایران',
  '022': 'بانک توسعه تعاون',
  '052': 'موسسه اعتباری قوامین',
  '053': 'بانک کارآفرین',
  '054': 'بانک پارسیان',
  '055': 'بانک اقتصادنوین',
  '056': 'بانک سامان',
  '057': 'بانک پاسارگاد',
  '058': 'بانک سرمایه',
  '059': 'بانک سینا',
  '060': 'قرض‌الحسنه مهر ایران',
  '061': 'بانک شهر',
  '062': 'بانک آینده',
  '063': 'بانک انصار',
  '064': 'بانک گردشگری',
  '065': 'بانک حکمت ایرانیان',
  '066': 'بانک دی',
  '069': 'بانک ایران زمین',
  '070': 'قرض‌الحسنه رسالت',
  '075': 'موسسه اعتباری ملل',
  '079': 'بانک مهر اقتصاد',
  '080': 'بانک خاورمیانه',
};

export function normalizeIban(value: string): string {
  const upper = toLatinDigits(value).toUpperCase().replace(/\s/g, '');
  const withoutPrefix = upper.startsWith('IR') ? upper.slice(2) : upper;
  const digits = withoutPrefix.replace(/\D/g, '');
  return `IR${digits}`;
}

export function isValidIranianIban(value: string): boolean {
  const iban = normalizeIban(value);
  return /^IR\d{24}$/.test(iban);
}

export function ibanBankCode(value: string): string | null {
  const iban = normalizeIban(value);
  if (iban.length < 7) return null;
  return iban.slice(4, 7);
}

export function ibanBankName(value: string): string | null {
  const code = ibanBankCode(value);
  if (!code) return null;
  return IBAN_BANK_NAMES[code] ?? null;
}
