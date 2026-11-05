import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../../database/prisma.service';
import { PickupRepository } from '../infrastructure/repositories/pickup.repository';
import { PhysicalGoldPickupStatus as Status } from '../domain/constants/pickup-states';
import { ListStaffPickupsDto } from './dto/list-staff-pickups.dto';
import { normalizePickupSearch, pickupDateBounds } from './pickup-list-filters';

describe('staff pickup filters', () => {
  const now = new Date('2026-11-04T21:00:00Z'); // November 5 in Tehran.

  it.each([
    ['today', '2026-11-04T20:30:00.000Z'],
    ['last7', '2026-10-29T20:30:00.000Z'],
    ['last30', '2026-10-06T20:30:00.000Z'],
  ])('uses Tehran boundaries for %s', (dateRange, start) => {
    const bounds = pickupDateBounds({ dateRange }, now)!;
    expect(bounds.gte.toISOString()).toBe(start);
    expect(bounds.lt.toISOString()).toBe('2026-11-05T20:30:00.000Z');
  });

  it('includes the entire custom end day using an exclusive next midnight', () => {
    const bounds = pickupDateBounds({ dateRange: 'custom', from: '2026-11-01', to: '2026-11-05' })!;
    expect(bounds.gte.toISOString()).toBe('2026-10-31T20:30:00.000Z');
    expect(bounds.lt.toISOString()).toBe('2026-11-05T20:30:00.000Z');
    expect(new Date('2026-11-05T20:29:59.999Z') < bounds.lt).toBe(true);
    expect(pickupDateBounds({ dateRange: 'all' })).toBeUndefined();
    expect(pickupDateBounds({})).toBeUndefined();
  });

  it.each([
    { dateRange: 'custom' },
    { dateRange: 'custom', from: '2026-11-06', to: '2026-11-05' },
    { dateRange: 'custom', from: '2026-02-30', to: '2026-11-05' },
  ])('rejects incomplete, reversed, or invalid custom dates', (query) => {
    expect(() => pickupDateBounds(query)).toThrow();
  });

  it('normalizes Arabic/Persian names, diacritics, whitespace, case, and digits', () => {
    expect(normalizePickupSearch(' عَلِي‌ كريمي ۱۲٣ ')).toBe(
      normalizePickupSearch('علی کریمی 123'),
    );
    expect(normalizePickupSearch(' PKP-۰۰۰۱ ')).toBe('pkp-0001');
    expect(normalizePickupSearch('۰۹۱۲ ٣٤٥٦٧٨٩')).toBe('09123456789');
  });

  it('validates real statuses, date presets, booleans, and paging at the API boundary', async () => {
    for (const status of Object.values(Status)) {
      expect(
        await validate(plainToInstance(ListStaffPickupsDto, { status, limit: '20', offset: '40' })),
      ).toHaveLength(0);
    }
    for (const query of [
      { status: 'PENDING' },
      { dateRange: 'week' },
      { actionRequired: 'yes' },
      { limit: 0 },
      { offset: -1 },
    ]) {
      expect((await validate(plainToInstance(ListStaffPickupsDto, query))).length).toBeGreaterThan(
        0,
      );
    }
  });

  it('combines normalized search, status, action, customer, and dates before counting and pagination', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'pickup-2' }]),
      physicalGoldPickup: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const repo = new PickupRepository(prisma as unknown as PrismaService);
    const requestedAt = pickupDateBounds({ dateRange: 'today' }, now);
    const result = await repo.listStaff({
      search: 'عَلِي ۱۲۳',
      status: Status.READY,
      actionRequired: true,
      customerId: 'customer-1',
      requestedAt,
      limit: 20,
      offset: 20,
    });
    const where = {
      status: Status.READY,
      customerId: 'customer-1',
      requestedAt,
      id: { in: ['pickup-2'] },
      AND: [{ status: { in: [Status.REQUESTED, Status.PREPARING, Status.READY] } }],
    };
    expect(prisma.physicalGoldPickup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where, take: 20, skip: 20, orderBy: { requestedAt: 'desc' } }),
    );
    expect(prisma.physicalGoldPickup.count).toHaveBeenCalledWith({ where });
    expect(prisma.$queryRaw.mock.calls[0][0].values).toEqual(['علی123']);
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain('translate(lower(');
    expect(prisma.$queryRaw.mock.calls[0][0].sql).toContain('يىك۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩');
    expect(result).toEqual({ items: [], total: 1 });
  });

  it('keeps terminal statuses ANDed with action-required, and handles an empty search match', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      physicalGoldPickup: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const repo = new PickupRepository(prisma as unknown as PrismaService);
    await repo.listStaff({ status: Status.CANCELLED, actionRequired: true, search: 'missing' });
    expect(prisma.physicalGoldPickup.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        status: Status.CANCELLED,
        id: { in: [] },
        AND: [{ status: { in: [Status.REQUESTED, Status.PREPARING, Status.READY] } }],
      }),
    });
    prisma.$queryRaw.mockClear();
    await repo.listStaff({});
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.physicalGoldPickup.count).toHaveBeenLastCalledWith({ where: {} });
  });
});
