import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { CurrentUserData } from '../decorators/current-user.decorator';

/**
 * Enforces permission-based access control.
 * Must run AFTER JwtAuthGuard (user must be authenticated first).
 *
 * Architecture ref: ARCHITECTURE.md §13
 * Business rule: BR-S01 — Backend enforces all permissions
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets) ?? [];
    const anyPermissions =
      this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, targets) ?? [];

    if (requiredPermissions.length === 0 && anyPermissions.length === 0) {
      return true;
    }

    const user = context.switchToHttp().getRequest<{ user: CurrentUserData }>().user;

    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    const hasAll =
      requiredPermissions.length === 0 ||
      requiredPermissions.every((perm) => user.permissions.includes(perm));
    const hasAny =
      anyPermissions.length === 0 || anyPermissions.some((perm) => user.permissions.includes(perm));

    if (!hasAll || !hasAny) {
      const required = [...requiredPermissions, ...anyPermissions];
      throw new ForbiddenException(`Insufficient permissions. Required: ${required.join(', ')}`);
    }

    return true;
  }
}
