import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC prevents an attacker with a database dump from enumerating 6-digit codes. */
export function hashOtp(mobile: string, purpose: string, code: string): string {
  const key = process.env.OTP_HASH_KEY || process.env.JWT_ACCESS_SECRET || '';
  if (key.length < 32) throw new Error('OTP_HASH_KEY or a strong JWT_ACCESS_SECRET is required.');
  return createHmac('sha256', key).update(`${purpose}\0${mobile}\0${code}`, 'utf8').digest('hex');
}

export function verifyOtpHash(
  expected: string,
  mobile: string,
  purpose: string,
  code: string,
): boolean {
  const actual = Buffer.from(hashOtp(mobile, purpose, code), 'hex');
  const stored = Buffer.from(expected, 'hex');
  return stored.length === actual.length && timingSafeEqual(stored, actual);
}
