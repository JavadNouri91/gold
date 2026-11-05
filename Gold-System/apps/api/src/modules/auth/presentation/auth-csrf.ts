import { Request, Response, NextFunction } from 'express';

/** Custom header requires preflight; validate Origin against the same exact CORS allowlist. */
export function authCsrf(origins: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      req.path.startsWith('/api/v1/auth') &&
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (req.headers['x-auth-request'] !== '1' ||
        (req.headers.origin && !origins.includes(req.headers.origin)))
    ) {
      res
        .status(403)
        .json({ success: false, error: { code: 'CSRF_REJECTED', message: 'درخواست معتبر نیست.' } });
      return;
    }
    next();
  };
}
