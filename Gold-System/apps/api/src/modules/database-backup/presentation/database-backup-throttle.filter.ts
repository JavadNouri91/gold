import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class DatabaseBackupThrottleFilter implements ExceptionFilter {
  catch(_error: ThrottlerException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const seconds = Math.max(
      1,
      ...['Retry-After-short', 'Retry-After-long', 'Retry-After'].map(
        (header) => Number(response.getHeader(header)) || 0,
      ),
    );
    response.setHeader('Retry-After', seconds);
    response.status(429).json({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `تعداد تلاش‌ها بیش از حد مجاز است. ${seconds} ثانیه دیگر دوباره تلاش کنید. این درخواست اجرا نشده است.`,
        details: { retryAfterSeconds: seconds },
      },
    });
  }
}
