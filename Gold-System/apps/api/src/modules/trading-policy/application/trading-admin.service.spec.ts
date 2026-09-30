import { Test } from '@nestjs/testing';
import { TradingAdminService } from './trading-admin.service';
import { TRADING_CLOCK, TradingPolicyService } from './trading-policy.service';
import { TradingRepository } from '../infrastructure/trading.repository';
import { AuditService } from '../../audit/application/audit.service';
import { TRADING_MESSAGES, SessionView } from '../domain/trading.types';

function session(partial: Partial<SessionView> = {}): SessionView {
  return {
    id: 'other',
    weekday: 'SATURDAY',
    dayOverrideId: null,
    title: 'بازه موجود',
    startMinute: 9 * 60,
    endMinute: 13 * 60,
    enabled: true,
    sortOrder: 0,
    maxAmountRial: null,
    minAmountRial: null,
    maxWeightGrams: null,
    minWeightGrams: null,
    maxCount: 10,
    maxSingleAmountRial: null,
    maxSingleWeightGrams: null,
    ...partial,
  };
}

describe('TradingAdminService session overlap', () => {
  const repo = {
    ensureSchedule: jest
      .fn()
      .mockResolvedValue({ id: 'global', enabled: true, timezone: 'Asia/Tehran' }),
    laneSessions: jest.fn(),
    createSession: jest.fn(),
    syncGlobalLimit: jest.fn(),
  };
  const audit = { log: jest.fn() };

  let service: TradingAdminService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        TradingAdminService,
        { provide: TradingRepository, useValue: repo },
        { provide: TradingPolicyService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: TRADING_CLOCK, useValue: () => new Date('2024-03-23T06:30:00.000Z') },
      ],
    }).compile();
    service = module.get(TradingAdminService);
  });

  it('rejects a weekly session that overlaps another session on the same day', async () => {
    repo.laneSessions.mockResolvedValue([session()]);

    await expect(
      service.createSession('actor-1', {
        title: 'بازه جدید',
        weekday: 'SATURDAY',
        startTime: '10:00',
        endTime: '12:00',
        enabled: true,
        maxCount: 5,
      }),
    ).rejects.toThrow(TRADING_MESSAGES.overlap);
    expect(repo.createSession).not.toHaveBeenCalled();
  });

  it('stores a session that only touches the previous one', async () => {
    repo.laneSessions.mockResolvedValue([session()]);
    const created = session({
      id: 'created',
      startMinute: 13 * 60,
      endMinute: 16 * 60,
      title: 'بازه دوم',
    });
    repo.createSession.mockResolvedValue(created);
    repo.syncGlobalLimit.mockResolvedValue({
      id: 'limit-1',
      scope: 'GLOBAL',
      scopeKey: null,
      sessionId: 'created',
      enabled: true,
      maxAmountRial: null,
      minAmountRial: null,
      maxWeightGrams: null,
      minWeightGrams: null,
      maxCount: 5,
      maxSingleAmountRial: null,
      maxSingleWeightGrams: null,
    });

    await service.createSession('actor-1', {
      title: 'بازه دوم',
      weekday: 'SATURDAY',
      startTime: '13:00',
      endTime: '16:00',
      enabled: true,
      maxCount: 5,
    });

    expect(repo.createSession).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRADING_SESSION_CREATED', actorId: 'actor-1' }),
    );
  });
});
