import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PermissionsGuard } from './permissions.guard';

function contextWith(permissions: string[] | undefined): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({
      getRequest: () => ({ user: permissions ? { permissions } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard trading access', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new PermissionsGuard(reflector as unknown as Reflector);

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
  });

  it('rejects an authenticated user who lacks trading.schedule.view', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === PERMISSIONS_KEY) return ['trading.schedule.view'];
      if (key === ANY_PERMISSIONS_KEY) return undefined;
      return undefined;
    });

    expect(() => guard.canActivate(contextWith(['trade.read']))).toThrow(ForbiddenException);
  });

  it('rejects when none of the trading read permissions are present', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === ANY_PERMISSIONS_KEY) {
        return ['trading.schedule.view', 'trading.limits.view', 'trading.audit.view'];
      }
      return undefined;
    });

    expect(() => guard.canActivate(contextWith(['customer.order.create']))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a user who holds one of the trading permissions', () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === ANY_PERMISSIONS_KEY) return ['trading.schedule.view', 'trading.limits.view'];
      return undefined;
    });

    expect(guard.canActivate(contextWith(['trading.limits.view']))).toBe(true);
  });
});
