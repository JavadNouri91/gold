import { formatRial, toPersianDigits } from '@/lib/utils';

export type MoneyTone = 'positive' | 'negative' | 'neutral';

export function moneyTone(value: string | null | undefined): MoneyTone {
  if (value == null) return 'neutral';
  const trimmed = value.trim();
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) return 'neutral';
  if (trimmed.startsWith('-')) return 'negative';
  if (/^0+(\.0+)?$/.test(trimmed)) return 'neutral';
  return 'positive';
}

export function toneClass(tone: MoneyTone): string {
  if (tone === 'positive') return 'text-[#16A34A]';
  if (tone === 'negative') return 'text-[#DC2626]';
  return 'text-[#6B7280]';
}

/** Display helper. Does not round or reprice; the sign is taken from the string. */
export function formatSignedRial(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return '—';
  const tone = moneyTone(value);
  const body = formatRial(value.trim().replace(/^-/, ''));
  if (body === '—') return '—';
  if (tone === 'positive') return `+${body}`;
  if (tone === 'negative') return `−${body}`;
  return body;
}

export function formatSignedPercent(value: string | null | undefined, tone: MoneyTone): string {
  if (value == null || value.trim() === '') return '';
  const body = toPersianDigits(value.trim().replace(/^-/, ''));
  const prefix = tone === 'positive' ? '+' : tone === 'negative' ? '−' : '';
  return `(${prefix}${body}٪)`;
}
