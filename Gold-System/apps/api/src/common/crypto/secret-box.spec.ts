import { randomBytes } from 'node:crypto';
import {
  decryptConnectSecret,
  encryptConnectSecret,
  isValidConnectEncryptionKey,
} from './secret-box';

describe('Connect secret encryption', () => {
  const secret = 'unique-connect-credential-that-must-not-appear';

  afterEach(() => {
    delete process.env.CONNECT_ENCRYPTION_KEY;
  });

  it('encrypts and decrypts using a valid 256-bit hex key', () => {
    process.env.CONNECT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const ciphertext = encryptConnectSecret(secret);
    expect(ciphertext).not.toContain(secret);
    expect(ciphertext.startsWith('connect1:')).toBe(true);
    expect(decryptConnectSecret(ciphertext)).toBe(secret);
  });

  it('rejects missing, malformed, and low-entropy keys', () => {
    delete process.env.CONNECT_ENCRYPTION_KEY;
    expect(() => encryptConnectSecret(secret)).toThrow('CONNECT_ENCRYPTION_KEY');
    expect(isValidConnectEncryptionKey('not-hex')).toBe(false);
    expect(isValidConnectEncryptionKey('a'.repeat(64))).toBe(false);
  });

  it('rejects decryption after key rotation instead of returning plaintext fallback', () => {
    process.env.CONNECT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    const ciphertext = encryptConnectSecret(secret);
    process.env.CONNECT_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    expect(() => decryptConnectSecret(ciphertext)).toThrow();
  });
});
