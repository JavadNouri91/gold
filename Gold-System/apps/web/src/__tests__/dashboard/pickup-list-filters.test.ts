import {
  EMPTY_PICKUP_FILTERS,
  pickupListHref,
  pickupReturnHref,
  readPickupFilters,
} from '@/lib/pickup-list-filters';

describe('pickup filter navigation', () => {
  it('round-trips applied filters and page through a detail return URL', () => {
    const filters = {
      ...EMPTY_PICKUP_FILTERS,
      search: 'علی ۰۹۱۲',
      status: 'READY',
      actionRequired: 'true',
      dateRange: 'custom',
      from: '2026-11-01',
      to: '2026-11-05',
    };
    const href = pickupListHref(filters, 3);
    expect(readPickupFilters(new URLSearchParams(href.split('?')[1]))).toEqual({
      filters,
      page: 3,
    });
    expect(pickupReturnHref(href)).toBe(href);
  });

  it('clears obsolete custom dates and rejects external or invalid return destinations', () => {
    const href = pickupListHref({
      ...EMPTY_PICKUP_FILTERS,
      dateRange: 'today',
      from: '2026-11-01',
      to: '2026-11-05',
    });
    expect(href).toBe('/dashboard/pickups?dateRange=today');
    expect(pickupListHref(EMPTY_PICKUP_FILTERS)).toBe('/dashboard/pickups');
    expect(pickupReturnHref('https://example.com')).toBe('/dashboard/pickups');
    expect(pickupReturnHref('/dashboard/pickups?status=PENDING&page=-2&dateRange=invalid')).toBe(
      '/dashboard/pickups',
    );
  });
});
