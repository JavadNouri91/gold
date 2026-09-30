import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — bypasses JwtAuthGuard.
 * Use sparingly. Most endpoints require authentication.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
