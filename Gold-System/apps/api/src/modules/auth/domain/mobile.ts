import { Transform } from 'class-transformer';

export function normalizeMobile(value: unknown): string {
  if (typeof value !== 'string') return '';
  const digits = value
    .trim()
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[\s()-]/g, '');
  return digits.replace(/^(?:\+98|0098|98)(9\d{9})$/, '0$1');
}

export const Mobile = () => Transform(({ value }) => normalizeMobile(value));
