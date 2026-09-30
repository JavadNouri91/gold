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
});
