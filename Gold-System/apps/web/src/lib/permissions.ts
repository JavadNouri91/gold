/**
 * Frontend permission helpers.
 *
 * These checks only control which controls are shown.
 * The API remains the authorization boundary.
 */

/** Self-service permissions issued to a customer account. */
export const CUSTOMER_SELF_PERMISSIONS = [
  'customer.profile.read',
  'customer.order.create',
  'customer.order.read_own',
  'customer.quotation.read_own',
  'customer.quotation.download_own',
  'customer.payment.read_own',
  'customer.account.read_own',
] as const;

export function hasPermission(
  permissions: readonly string[] | undefined | null,
  required: string | readonly string[],
): boolean {
  if (!permissions?.length) return false;
  const needed = Array.isArray(required) ? required : [required];
  return needed.some((permission) => permissions.includes(permission));
}

/** A user is internal staff when they hold any permission outside the customer portal set. */
export function isStaffUser(permissions: readonly string[] | undefined | null): boolean {
  if (!permissions?.length) return false;
  return permissions.some(
    (permission) =>
      !CUSTOMER_SELF_PERMISSIONS.includes(
        permission as (typeof CUSTOMER_SELF_PERMISSIONS)[number],
      ),
  );
}
