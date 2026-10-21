import type { StaffQuotation } from '@/lib/internal-api';

export function orderMayHaveQuotation(status: string | undefined | null): boolean {
  return Boolean(status) && status !== 'DRAFT' && status !== 'SUBMITTED';
}

export function featuredStaffQuotation(list: StaffQuotation[]): StaffQuotation | null {
  return list.find((quote) => quote.status === 'ACTIVE') ?? list[0] ?? null;
}

export function orderCanQuickApprove(status: string | undefined | null): boolean {
  return status === 'QUOTED' || status === 'ASSIGNED' || status === 'UNDER_REVIEW';
}
