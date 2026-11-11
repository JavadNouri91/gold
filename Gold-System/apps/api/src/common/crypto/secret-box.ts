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
const SMS_FORMAT_VERSION = 'sms1';
const CONNECT_FORMAT_VERSION = 'connect1';

function keyBytes(secret: string): Buffer {
  if (!secret) throw new Error('Secret encryption key is not configured.');
  return createHash('sha256').update(secret, 'utf8').digest();
}

function legacyKeyBytes(): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || '';
  if (!secret) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY or JWT_ACCESS_SECRET must be set to store encrypted settings.',
    );
  }
  return keyBytes(secret);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', legacyKeyBytes(), iv);
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
  const decipher = createDecipheriv('aes-256-gcm', legacyKeyBytes(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

/** Dedicated SMS key. New credentials never fall back to JWT or settings keys. */
export function encryptSmsSecret(plaintext: string): string {
  const secret = process.env.SMS_ENCRYPTION_KEY || '';
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('SMS_ENCRYPTION_KEY must contain at least 32 bytes to store SMS credentials.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    SMS_FORMAT_VERSION,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/** Reads new SMS ciphertext and legacy v1 ciphertext during key migration. */
export function decryptSmsSecret(payload: string): { value: string; legacy: boolean } {
  const [version, iv, tag, data] = payload.split(':');
  if (version === FORMAT_VERSION) return { value: decryptSecret(payload), legacy: true };
  if (version !== SMS_FORMAT_VERSION || !iv || !tag || !data) {
    throw new Error('Unsupported encrypted SMS secret format.');
  }
  const secret = process.env.SMS_ENCRYPTION_KEY || '';
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('SMS_ENCRYPTION_KEY must contain at least 32 bytes.');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(secret), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return {
    value: Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
      'utf8',
    ),
    legacy: false,
  };
}

/** Connect credentials use a dedicated key and never fall back to JWT keys. */
export function encryptConnectSecret(plaintext: string): string {
  return encryptWithDedicatedKey(plaintext, 'CONNECT_ENCRYPTION_KEY', CONNECT_FORMAT_VERSION);
}

export function decryptConnectSecret(payload: string): string {
  return decryptWithDedicatedKey(payload, 'CONNECT_ENCRYPTION_KEY', CONNECT_FORMAT_VERSION);
}

/** Connect keys are 256-bit random values encoded as exactly 64 hexadecimal characters. */
export function isValidConnectEncryptionKey(secret: string): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(secret)) return false;
  const bytes = Buffer.from(secret, 'hex');
  const counts = new Map<number, number>();
  for (const byte of bytes) counts.set(byte, (counts.get(byte) ?? 0) + 1);
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / bytes.length;
    return sum - probability * Math.log2(probability);
  }, 0);
  return counts.size >= 18 && entropy >= 4;
}

function encryptWithDedicatedKey(plaintext: string, envName: string, version: string): string {
  const secret = process.env[envName] || '';
  const key = dedicatedKeyBytes(secret, envName);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    version,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decryptWithDedicatedKey(payload: string, envName: string, version: string): string {
  const [storedVersion, iv, tag, data] = payload.split(':');
  if (storedVersion !== version || !iv || !tag || !data)
    throw new Error('Unsupported encrypted secret format.');
  const secret = process.env[envName] || '';
  const key = dedicatedKeyBytes(secret, envName);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString(
    'utf8',
  );
}

function dedicatedKeyBytes(secret: string, envName: string): Buffer {
  if (envName === 'CONNECT_ENCRYPTION_KEY') {
    if (!isValidConnectEncryptionKey(secret))
      throw new Error(
        'CONNECT_ENCRYPTION_KEY must be 64 hexadecimal characters with sufficient entropy.',
      );
    return Buffer.from(secret, 'hex');
  }
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error(`${envName} must contain at least 32 bytes.`);
  return keyBytes(secret);
}

/** Never send a stored secret to the browser — only a hint that it exists. */
export function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
