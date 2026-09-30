import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const ANY_PERMISSIONS_KEY = 'any_permissions';

/**
 * Declares required permissions for a route.
 * Enforced by PermissionsGuard.
 *
 * Architecture ref: ARCHITECTURE.md §13 — Authorization
 * Business rule: BR-S01 — Permissions enforced at backend
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** The caller must hold at least one of these permissions. */
export const RequireAnyPermission = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
