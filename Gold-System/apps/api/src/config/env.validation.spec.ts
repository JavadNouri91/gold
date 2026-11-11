import { randomBytes } from 'node:crypto';
import { validateEnv } from './env.validation';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://localhost:5432/gold',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};

describe('validateEnv', () => {
  it('allows the mock SMS provider outside production', () => {
    expect(validateEnv({ ...baseEnv, SMS_PROVIDER: 'mock' }).SMS_PROVIDER).toBe('mock');
  });

  it('rejects the mock SMS provider in production', () => {
    expect(() => validateEnv({ ...baseEnv, NODE_ENV: 'production', SMS_PROVIDER: 'mock' })).toThrow(
      /SMS_PROVIDER=mock/,
    );
  });

  it('accepts a high-entropy Connect key in the documented 64-character hex format', () => {
    const key = randomBytes(32).toString('hex');
    expect(validateEnv({ ...baseEnv, CONNECT_ENCRYPTION_KEY: key }).CONNECT_ENCRYPTION_KEY).toBe(
      key,
    );
  });

  it('rejects malformed and low-entropy Connect keys', () => {
    expect(() => validateEnv({ ...baseEnv, CONNECT_ENCRYPTION_KEY: 'a'.repeat(64) })).toThrow(
      /CONNECT_ENCRYPTION_KEY/,
    );
    expect(() => validateEnv({ ...baseEnv, CONNECT_ENCRYPTION_KEY: 'short' })).toThrow(
      /CONNECT_ENCRYPTION_KEY/,
    );
  });
});
