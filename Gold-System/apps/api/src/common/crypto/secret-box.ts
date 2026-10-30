import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Small AES-256-GCM helper for secrets that must live in the database
 * (SMS provider API keys, panel passwords).
 *
 * Key material comes from SETTINGS_ENCRYPTION_KEY, falling back to
 * JWT_ACCESS_SECRET so a fresh installation works without extra setup.
 * Rotating that secret makes previously stored values undecryptable:
 * callers must treat a decrypt failure as "not configured" and fall back
 * to the .env values.
 *
 * Format: v1:<iv base64>:<auth tag base64>:<ciphertext base64>
 */

const FORMAT_VERSION = 'v1';

function keyBytes(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || '';
  if (!secret) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY or JWT_ACCESS_SECRET must be set to store encrypted settings.',
    );
  }
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    FORMAT_VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== FORMAT_VERSION || !iv || !tag || !data) {
    throw new Error('Unsupported encrypted secret format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** Never send a stored secret to the browser — only a hint that it exists. */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
