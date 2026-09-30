import { randomBytes } from 'crypto';

/** 256-bit secret. Callers persist only a SHA-256 hash of this value. */
export function generateSessionSecret(): string {
  return randomBytes(32).toString('base64url');
}
