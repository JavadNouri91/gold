/** Convert a non-negative integer (as Latin digit string) to Persian words. */
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = [
  'ده',
  'یازده',
  'دوازده',
  'سیزده',
  'چهارده',
  'پانزده',
  'شانزده',
  'هفده',
  'هجده',
  'نوزده',
];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function underThousand(n: number): string {
  if (n <= 0) return '';
  if (n < 10) return ONES[n] ?? '';
  if (n < 20) return TEENS[n - 10] ?? '';
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return one ? `${TENS[ten]} و ${ONES[one]}` : (TENS[ten] ?? '');
  }
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const head = HUNDREDS[hundred] ?? '';
  if (!rest) return head;
  return `${head} و ${underThousand(rest)}`;
}

/**
 * Persian words for a whole toman amount (digits only, no separators).
 * Returns empty string when input is empty or not a positive integer.
 */
export function tomanAmountToPersianWords(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '');
  if (!digits) return '';
  if (/^0+$/.test(digits)) return 'صفر';

  // Cap at 15 digits to avoid runaway strings in the UI.
  const clipped = digits.length > 15 ? digits.slice(0, 15) : digits;
  const groups: number[] = [];
  for (let i = clipped.length; i > 0; i -= 3) {
    groups.push(Number(clipped.slice(Math.max(0, i - 3), i)));
  }

  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const value = groups[i] ?? 0;
    if (!value) continue;
    const scale = SCALES[i] ?? '';
    const words = underThousand(value);
    parts.push(scale ? `${words} ${scale}` : words);
  }

  return parts.join(' و ');
}

export function tomanAmountWordsLabel(rawDigits: string): string | null {
  const words = tomanAmountToPersianWords(rawDigits);
  if (!words) return null;
  return `معادل: ${words} تومان`;
}
