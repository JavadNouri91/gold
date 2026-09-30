import { Test } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { TradingPolicyService, TRADING_CLOCK } from './trading-policy.service';
import { TradingRepository } from '../infrastructure/trading.repository';
import { TRADING_MESSAGES, LimitView, SessionView } from '../domain/trading.types';

const THURSDAY_1000 = new Date('2024-03-21T06:30:00.000Z');
const THURSDAY_1500 = new Date('2024-03-21T11:30:00.000Z');
const THURSDAY_1800 = new Date('2024-03-21T14:30:00.000Z');

function session(partial: Partial<SessionView> = {}): SessionView {
  return {
    id: 'session-1',
    weekday: 'THURSDAY',
    dayOverrideId: null,
    title: 'بازه صبح',
    startMinute: 9 * 60,
    endMinute: 13 * 60,
    enabled: true,
    sortOrder: 0,
    maxAmountRial: new Decimal('500'),
    minAmountRial: null,
    maxWeightGrams: new Decimal('250'),
    minWeightGrams: null,
    maxCount: 10,
    maxSingleAmountRial: null,
    maxSingleWeightGrams: null,
    ...partial,
  };
}

function limit(partial: Partial<LimitView>): LimitView {
  return {
    id: 'limit-1',
    scope: 'ROLE',
    scopeKey: 'role-seller',
    sessionId: 'session-1',
    enabled: true,
    maxAmountRial: null,
    minAmountRial: null,
    maxWeightGrams: null,
    minWeightGrams: null,
    maxCount: 2,
    maxSingleAmountRial: null,
    maxSingleWeightGrams: null,
    ...partial,
  };
}

describe('TradingPolicyService', () => {
  let service: TradingPolicyService;
  const repo = {
    ensureSchedule: jest.fn(),
    findOverrideByDateKey: jest.fn(),
    listWeekly: jest.fn(),
    usageBetween: jest.fn(),
    limitsForSessions: jest.fn(),
    lockSession: jest.fn(),
    roleIdsForUser: jest.fn(),
    userIdForCustomer: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.ensureSchedule.mockResolvedValue({ id: 'global', enabled: true, timezone: 'Asia/Tehran' });
    repo.findOverrideByDateKey.mockResolvedValue(null);
    repo.listWeekly.mockResolvedValue([session()]);
    repo.usageBetween.mockResolvedValue({
      count: 0,
      amountRial: new Decimal(0),
      weightGrams: new Decimal(0),
    });
    repo.limitsForSessions.mockResolvedValue([]);
    repo.roleIdsForUser.mockResolvedValue([]);
    repo.userIdForCustomer.mockResolvedValue(null);

    const module = await Test.createTestingModule({
      providers: [
        TradingPolicyService,
        { provide: TradingRepository, useValue: repo },
        { provide: TRADING_CLOCK, useValue: () => THURSDAY_1000 },
      ],
    }).compile();
    service = module.get(TradingPolicyService);
  });

  it('allows a trade inside the weekly session', async () => {
    await expect(
      service.validateTransaction({ amountRial: '10', weightGrams: '1', tx: {} as never }),
    ).resolves.toBeUndefined();
    expect(repo.lockSession).toHaveBeenCalled();
    expect(await service.isTradingOpen()).toBe(true);
    expect((await service.getActiveSession())?.id).toBe('session-1');
  });

  it('rejects a trade outside the weekly session', async () => {
    await expect(
      service.validateTransaction({ at: THURSDAY_1500, amountRial: '10', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.closed);
    expect(await service.isTradingOpen(THURSDAY_1500)).toBe(false);
  });

  it('blocks the whole day on an enabled full-day holiday', async () => {
    repo.findOverrideByDateKey.mockResolvedValue({
      id: 'holiday-1',
      date: '2024-03-21',
      kind: 'FULL_CLOSURE',
      title: 'تعطیل رسمی',
      enabled: true,
      sessions: [],
    });

    await expect(
      service.validateTransaction({ amountRial: '10', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.holiday);
    expect(repo.listWeekly).not.toHaveBeenCalled();
    const assessment = await service.assess(THURSDAY_1000);
    expect(assessment.status).toBe('تعطیل');
  });

  it('lets an enabled special schedule replace the weekly template', async () => {
    repo.findOverrideByDateKey.mockResolvedValue({
      id: 'override-1',
      date: '2024-03-21',
      kind: 'SPECIAL_SCHEDULE',
      title: 'ساعت کاری ویژه',
      enabled: true,
      sessions: [
        session({
          id: 'special',
          weekday: null,
          dayOverrideId: 'override-1',
          startMinute: 16 * 60,
          endMinute: 21 * 60,
        }),
      ],
    });

    await expect(
      service.validateTransaction({ at: THURSDAY_1800, amountRial: '10', weightGrams: '1' }),
    ).resolves.toBeUndefined();
    expect(repo.listWeekly).not.toHaveBeenCalled();
  });

  it('ignores a disabled daily exception and uses the weekly session', async () => {
    repo.findOverrideByDateKey.mockResolvedValue({
      id: 'holiday-1',
      date: '2024-03-21',
      kind: 'FULL_CLOSURE',
      title: 'لغوشده',
      enabled: false,
      sessions: [],
    });

    await expect(
      service.validateTransaction({ amountRial: '10', weightGrams: '1' }),
    ).resolves.toBeUndefined();
    expect(repo.listWeekly).toHaveBeenCalledWith('THURSDAY');
  });

  it('rejects a disabled session even when the clock is inside it', async () => {
    repo.listWeekly.mockResolvedValue([session({ enabled: false })]);
    await expect(
      service.validateTransaction({ amountRial: '10', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.closed);
  });

  it('rejects when the schedule itself is disabled', async () => {
    repo.ensureSchedule.mockResolvedValue({
      id: 'global',
      enabled: false,
      timezone: 'Asia/Tehran',
    });
    await expect(
      service.validateTransaction({ amountRial: '10', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.closed);
  });

  it('enforces monetary, weight, and count caps, including the exact boundary', async () => {
    repo.usageBetween.mockResolvedValue({
      count: 9,
      amountRial: new Decimal('400'),
      weightGrams: new Decimal('200'),
    });
    await expect(
      service.validateTransaction({ amountRial: '100', weightGrams: '50' }),
    ).resolves.toBeUndefined();

    repo.usageBetween.mockResolvedValue({
      count: 0,
      amountRial: new Decimal('400'),
      weightGrams: new Decimal('0'),
    });
    await expect(
      service.validateTransaction({ amountRial: '100.01', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.amount);

    repo.usageBetween.mockResolvedValue({
      count: 0,
      amountRial: new Decimal('0'),
      weightGrams: new Decimal('249'),
    });
    await expect(
      service.validateTransaction({ amountRial: '1', weightGrams: '1.000001' }),
    ).rejects.toThrow(TRADING_MESSAGES.weight);

    repo.usageBetween.mockResolvedValue({
      count: 10,
      amountRial: new Decimal('0'),
      weightGrams: new Decimal('0'),
    });
    await expect(
      service.validateTransaction({ amountRial: '1', weightGrams: '1' }),
    ).rejects.toThrow(TRADING_MESSAGES.count);
  });

  it('applies a role limit instead of the wider session cap', async () => {
    repo.limitsForSessions.mockResolvedValue([limit({})]);
    repo.usageBetween.mockResolvedValue({
      count: 2,
      amountRial: new Decimal('0'),
      weightGrams: new Decimal('0'),
    });

    await expect(
      service.validateTransaction({
        amountRial: '1',
        weightGrams: '1',
        roleIds: ['role-seller'],
      }),
    ).rejects.toThrow(TRADING_MESSAGES.count);

    await expect(
      service.validateTransaction({
        amountRial: '1',
        weightGrams: '1',
        roleIds: ['role-other'],
      }),
    ).resolves.toBeUndefined();
  });
});
