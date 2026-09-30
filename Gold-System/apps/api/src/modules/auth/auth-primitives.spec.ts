import { generateNumericOtp } from './domain/otp-generator';
import { hashRefreshToken } from './domain/refresh-token.hash';

describe('auth primitives', () => {
  it('generates a numeric OTP of the requested length', () => {
    const otp = generateNumericOtp(6);
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('hashes a refresh token deterministically', () => {
    const token = '11111111-1111-1111-1111-111111111111';
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(hashRefreshToken(token + 'x'));
  });
});
