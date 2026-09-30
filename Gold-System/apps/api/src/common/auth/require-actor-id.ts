import { UnauthorizedException } from '@nestjs/common';

/**
 * JwtStrategy exposes both `userId` and `sub` (the same user id).
 * Controllers must not read only `sub` — a token validated by the strategy
 * always has `userId`, and older call sites read `sub`.
 */
export function requireActorId(user: { userId?: string; sub?: string } | undefined): string {
  const id = user?.userId || user?.sub;
  if (!id) {
    throw new UnauthorizedException('Authentication required');
  }
  return id;
}
