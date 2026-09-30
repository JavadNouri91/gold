import { randomInt } from 'crypto';

/** Cryptographic numeric OTP. Never use Math.random for authentication codes. */
export function generateNumericOtp(length: number): string {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}
