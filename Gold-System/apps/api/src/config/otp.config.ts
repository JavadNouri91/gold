import { registerAs } from '@nestjs/config';

export default registerAs('otp', () => ({
  // Decision ref: docs/21-business-decisions.md §11.1
  // OTP required for ALL users, except a temporary local-development bypass.
  expiresInSeconds: parseInt(process.env.OTP_EXPIRES_IN_SECONDS ?? '120', 10),
  length: parseInt(process.env.OTP_LENGTH ?? '6', 10),
  maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '3', 10),
  loginBypass: process.env.NODE_ENV !== 'production' && process.env.OTP_LOGIN_BYPASS !== 'false',
}));
