/** Who cancelled a physical gold pickup — short actor name for "لغوکننده: …". */
export function pickupCancelActorName(
  kind: 'CUSTOMER' | 'STAFF' | null | undefined,
  audience: 'portal' | 'staff' = 'portal',
): string {
  if (kind === 'STAFF') {
    return audience === 'portal' ? 'فروشگاه' : 'کارمند';
  }
  if (kind === 'CUSTOMER') {
    return audience === 'portal' ? 'شما' : 'مشتری';
  }
  return 'نامشخص';
}
