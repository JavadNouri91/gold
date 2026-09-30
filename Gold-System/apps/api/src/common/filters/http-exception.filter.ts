import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '@gold/shared-types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: Record<string, unknown> | undefined;

    if (isFileTooLarge(exception)) {
      status = HttpStatus.BAD_REQUEST;
      code = 'FILE_TOO_LARGE';
      message = 'حجم فایل بیش از حد مجاز است.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.statusToCode(status);
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) ?? message;
        code = (resp['code'] as string) ?? this.statusToCode(status);
        details = resp['details'] as Record<string, unknown> | undefined;

        // Handle class-validator array of messages
        if (Array.isArray(resp['message'])) {
          message = 'Validation failed';
          details = { errors: resp['message'] };
        }
      }
    } else if (exception instanceof Error) {
      // Never expose internal error details in non-development
      const isDev = process.env.NODE_ENV === 'development';
      message = isDev ? exception.message : 'An unexpected error occurred';
      this.logger.error(exception.message, exception.stack);
    }

    const body: ApiResponse = {
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    };

    this.logger.warn(`${request.method} ${request.url} → ${status} [${code}]`);

    response.status(status).json(body);
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
    };
    return map[status] ?? 'ERROR';
  }
}

function isFileTooLarge(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as { code?: string }).code === 'LIMIT_FILE_SIZE'
  );
}
