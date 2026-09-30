import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

export interface CurrentUserData {
  userId: string;
  /** Same value as userId. Kept so call sites that read `req.user.sub` resolve the actor. */
  sub: string;
  mobile: string;
  roles: string[];
  permissions: string[];
  /** Refresh-token session bound to this access token, when the token has one. */
  sessionId?: string | null;
}

/**
 * Extracts the authenticated user from the request context.
 * Populated by JwtAuthGuard / JwtStrategy.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserData => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request['user'] as CurrentUserData | undefined;
    if (!user) {
      // Safety net: JwtAuthGuard should have already blocked unauthenticated
      // requests, but if req.user is somehow absent throw a clean 401.
      throw new UnauthorizedException('Authentication required');
    }
    return user;
  },
);
