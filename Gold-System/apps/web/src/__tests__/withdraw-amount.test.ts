import {
  exceedsAvailableBalance,
  percentOfAvailableToman,
  remainingAfterWithdrawRial,
} from '@/lib/withdraw-amount';

describe('withdraw-amount helpers', () => {
  it('computes percent of available toman', () => {
    expect(percentOfAvailableToman('2084314040', 50)).toBe('104215702');
    expect(percentOfAvailableToman('2084314040', 100)).toBe('208431404');
  });

  it('detects over-balance withdrawals', () => {
    expect(exceedsAvailableBalance('1000', '200')).toBe(true);
    expect(exceedsAvailableBalance('1000', '50')).toBe(false);
  });

  it('computes remaining wallet balance', () => {
    expect(remainingAfterWithdrawRial('2084314040', '50000000')).toBe('1584314040');
  });
});
