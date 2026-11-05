import { BadRequestException } from '@nestjs/common';
import { tehranDateStartUtc, tehranParts } from '../../trading-policy/domain/trading-time';
import type { ListStaffPickupsDto } from './dto/list-staff-pickups.dto';

const DAY = 86_400_000;

/** Request dates are Tehran calendar days; the upper boundary is exclusive. */
export function pickupDateBounds(query: ListStaffPickupsDto, now = new Date()) {
  const today = tehranDateStartUtc(tehranParts(now).dateKey);
  const days = { today: 1, last7: 7, last30: 30 }[query.dateRange ?? ''];
  if (days) {
    return {
      gte: new Date(today.getTime() - (days - 1) * DAY),
      lt: new Date(today.getTime() + DAY),
    };
  }
  if (query.dateRange !== 'custom') return undefined;
  const parse = (key?: string) => {
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key))
      throw new BadRequestException('بازه تاریخ را کامل وارد کنید.');
    const date = tehranDateStartUtc(key);
    if (!Number.isFinite(date.getTime()) || tehranParts(date).dateKey !== key)
      throw new BadRequestException('تاریخ نامعتبر است.');
    return date;
  };
  const start = parse(query.from);
  const end = parse(query.to);
  if (start > end) throw new BadRequestException('تاریخ پایان باید پس از تاریخ شروع باشد.');
  return { gte: start, lt: new Date(end.getTime() + DAY) };
}

export function normalizePickupSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[\s\u200c\u0640\u064b-\u065f\u0670]/g, '');
}
