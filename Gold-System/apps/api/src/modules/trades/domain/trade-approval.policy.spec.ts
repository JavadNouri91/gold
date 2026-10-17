import Decimal from 'decimal.js';
import { evaluateTradeApproval, requiredTradeApprovals } from './trade-approval.policy';

describe('trade approval policy', () => {
  it('treats the first approval as final in MVP', () => {
    expect(evaluateTradeApproval({ recordedCount: 1 })).toEqual({
      requiredCount: 1,
      recordedCount: 1,
      isFinal: true,
    });
  });

  it('waits when more than one approval is required', () => {
    const decision = evaluateTradeApproval({ recordedCount: 1, requiredCount: 2 });
    expect(decision.isFinal).toBe(false);
    expect(decision.requiredCount).toBe(2);
  });

  it('raises the requirement when amount meets a configured threshold', () => {
    expect(
      requiredTradeApprovals({
        recordedCount: 1,
        amountRial: new Decimal('50000000'),
        dualApprovalThresholdRial: new Decimal('10000000'),
      }),
    ).toBe(2);

    expect(
      evaluateTradeApproval({
        recordedCount: 1,
        amountRial: new Decimal('50000000'),
        dualApprovalThresholdRial: new Decimal('10000000'),
      }).isFinal,
    ).toBe(false);
  });

  it('does not raise the requirement when the threshold is unset', () => {
    expect(
      requiredTradeApprovals({
        recordedCount: 1,
        amountRial: new Decimal('999999999'),
        dualApprovalThresholdRial: null,
      }),
    ).toBe(1);
  });
});
