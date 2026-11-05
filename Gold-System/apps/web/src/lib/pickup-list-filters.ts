export const EMPTY_PICKUP_FILTERS = {
  search: '',
  status: '',
  dateRange: '',
  from: '',
  to: '',
  actionRequired: '',
};
export type PickupListFilters = typeof EMPTY_PICKUP_FILTERS;

export function readPickupFilters(params: URLSearchParams) {
  const filters = { ...EMPTY_PICKUP_FILTERS };
  for (const key of Object.keys(filters) as Array<keyof PickupListFilters>) {
    filters[key] = params.get(key) ?? '';
  }
  if (!['REQUESTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'].includes(filters.status))
    filters.status = '';
  if (!['today', 'last7', 'last30', 'custom'].includes(filters.dateRange)) filters.dateRange = '';
  filters.actionRequired = filters.actionRequired === 'true' ? 'true' : '';
  const page = Number(params.get('page') ?? 1);
  return { filters, page: Number.isSafeInteger(page) && page > 0 ? page : 1 };
}

export function pickupListHref(filters: PickupListFilters, page = 1) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value && (!['from', 'to'].includes(key) || filters.dateRange === 'custom'))
      params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  return `/dashboard/pickups${params.size ? `?${params}` : ''}`;
}

export function pickupReturnHref(value: string | null) {
  if (!value?.startsWith('/dashboard/pickups?')) return '/dashboard/pickups';
  const { filters, page } = readPickupFilters(new URLSearchParams(value.split('?')[1]));
  return pickupListHref(filters, page);
}
