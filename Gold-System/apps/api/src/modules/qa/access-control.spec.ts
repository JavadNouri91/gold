import { readFileSync } from 'fs';
import { join } from 'path';
import { UnauthorizedException } from '@nestjs/common';
import { requireActorId } from '../../common/auth/require-actor-id';

describe('global access control', () => {
  const appModule = readFileSync(join(__dirname, '..', '..', 'app.module.ts'), 'utf8');

  it('registers throttle, JWT, and permission guards globally', () => {
    expect(appModule).toContain('useClass: ThrottlerGuard');
    expect(appModule).toContain('useClass: JwtAuthGuard');
    expect(appModule).toContain('useClass: PermissionsGuard');
  });

  it('resolves the actor from userId when sub is absent', () => {
    expect(requireActorId({ userId: 'user-1' })).toBe('user-1');
    expect(requireActorId({ sub: 'user-2' })).toBe('user-2');
    expect(() => requireActorId(undefined)).toThrow(UnauthorizedException);
  });
});
