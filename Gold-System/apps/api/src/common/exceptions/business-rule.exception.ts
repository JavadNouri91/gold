import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when a domain/business rule is violated.
 * Produces HTTP 422 Unprocessable Entity with a domain-specific error code.
 *
 * Architecture ref: ARCHITECTURE.md §20 — Error Handling
 */
export class BusinessRuleException extends HttpException {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(
      {
        code,
        message,
        ...(details ? { details } : {}),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
