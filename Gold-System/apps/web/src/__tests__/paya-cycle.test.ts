import { nextPayaCycleLabel } from '@/lib/paya-cycle';

describe('nextPayaCycleLabel', () => {
  it('points to today before the cutoff', () => {
    const morning = new Date('2026-03-19T06:00:00.000Z'); // 09:30 Tehran
    expect(nextPayaCycleLabel(morning)).toContain('امروز');
    expect(nextPayaCycleLabel(morning)).toContain('۱۳:۴۵');
  });

  it('points to tomorrow after the cutoff', () => {
    const evening = new Date('2026-03-19T12:00:00.000Z'); // 15:30 Tehran
    expect(nextPayaCycleLabel(evening)).toContain('فردا');
  });
});
