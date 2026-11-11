import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { DatabaseRestoreService } from '../application/database-restore.service';

@Injectable()
export class DatabaseRestoreMiddleware implements NestMiddleware {
  constructor(private readonly restore: DatabaseRestoreService) {}
  use(_request: Request, response: Response, next: NextFunction) {
    if (!this.restore.busy) {
      this.restore.activeRequests++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        this.restore.activeRequests--;
      };
      response.once('finish', release);
      response.once('close', release);
      return next();
    }
    response.setHeader('Retry-After', '30');
    response.status(503).json({
      success: false,
      error: {
        code: 'DATABASE_RESTORE_IN_PROGRESS',
        message: 'بازیابی پایگاه داده در حال انجام است. کمی بعد دوباره تلاش کنید.',
      },
    });
  }
}
