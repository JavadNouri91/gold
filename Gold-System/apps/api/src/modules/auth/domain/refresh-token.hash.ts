import { createHash } from 'crypto';

/**
 * Deterministic hash for refresh-token lookup.
 *
 * Argon2 is salted, so hashing the same token twice never matches a unique
 * index lookup. Refresh tokens are high-entropy UUIDs, so SHA-256 is the
 * correct stored form: equal tokens produce equal hashes.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
