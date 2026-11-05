import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { map } from 'rxjs/operators';

export const REFRESH_COOKIE = 'gold_refresh';
export const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
});

export function readRefreshCookie(req: Request): string {
  const value = req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${REFRESH_COOKIE}=`))
    ?.slice(REFRESH_COOKIE.length + 1);
  try {
    return value ? decodeURIComponent(value) : '';
  } catch {
    return '';
  }
}

@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((result) => {
        if (result && typeof result.refreshToken === 'string') {
          response.cookie(REFRESH_COOKIE, result.refreshToken, {
            ...refreshCookieOptions(),
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });
          const safe = { ...result };
          delete safe.refreshToken;
          return safe;
        }
        return result;
      }),
    );
  }
}
