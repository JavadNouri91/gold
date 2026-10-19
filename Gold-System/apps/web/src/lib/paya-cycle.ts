import { toPersianDigits } from '@/lib/utils';

/** Next Central Bank PAYA cycle label in Tehran time (default cut-off ۱۳:۴۵). */
export function nextPayaCycleLabel(now = new Date(), cutHour = 13, cutMinute = 45): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';

  const hour = Number(get('hour'));
  const minute = Number(get('minute'));
  const pastCutoff = hour > cutHour || (hour === cutHour && minute >= cutMinute);
  const when = pastCutoff ? 'فردا' : 'امروز';
  const time = toPersianDigits(
    `${String(cutHour).padStart(2, '0')}:${String(cutMinute).padStart(2, '0')}`,
  );

  return `واریز در نزدیک‌ترین سیکل پایا بانک مرکزی (ساعت ${time} ${when})`;
}
