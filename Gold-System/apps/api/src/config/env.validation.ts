import * as Joi from 'joi';
import { isValidConnectEncryptionKey } from '../common/crypto/secret-box';

export function validateEnv(config: Record<string, unknown>) {
  const schema = Joi.object({
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
    APP_PORT: Joi.number().default(4002),
    DATABASE_URL: Joi.string().required(),
    JWT_ACCESS_SECRET: Joi.string().min(32).required(),
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
    OTP_EXPIRES_IN_SECONDS: Joi.number().default(120),
    OTP_LENGTH: Joi.number().default(6),
    // SMS Provider — docs/21-business-decisions.md §10.1
    // open-questions #31: provider not yet finalized; mock is safe default
    SMS_PROVIDER: Joi.string().valid('hisms', 'smsir', 'melipayamak', 'mock').default('hisms'),
    SMS_API_KEY: Joi.string().default(''),
    SMS_SENDER_LINE: Joi.string().default(''),
    SMS_ENCRYPTION_KEY: Joi.string().min(32).allow('').default(''),
    CONNECT_ENCRYPTION_KEY: Joi.string()
      .allow('')
      .custom((value, helpers) =>
        value === '' || isValidConnectEncryptionKey(value) ? value : helpers.error('any.invalid'),
      )
      .messages({
        'any.invalid':
          '"CONNECT_ENCRYPTION_KEY" must be 64 hexadecimal characters with sufficient entropy.',
      })
      .default(''),
    OTP_HASH_KEY: Joi.string().min(32).allow('').default(''),
    // Local filesystem storage — docs/deployment.md
    STORAGE_LOCAL_ROOT: Joi.string().default('.data/uploads'),
  }).unknown(true);

  const { error, value } = schema.validate(config, { abortEarly: false });

  if (error) {
    throw new Error(
      `Environment validation failed:\n${error.details.map((d) => `  - ${d.message}`).join('\n')}`,
    );
  }

  if (value.NODE_ENV === 'production' && value.SMS_PROVIDER === 'mock') {
    throw new Error(
      'Environment validation failed:\n  - SMS_PROVIDER=mock is not permitted when NODE_ENV=production',
    );
  }

  if (value.NODE_ENV === 'production' && !isAbsolutePath(value.STORAGE_LOCAL_ROOT)) {
    throw new Error(
      'Environment validation failed:\n  - STORAGE_LOCAL_ROOT must be an absolute path when NODE_ENV=production',
    );
  }

  return value;
}

function isAbsolutePath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}
