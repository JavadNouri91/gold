import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for cancelling an order.
 * A cancellation reason is mandatory for audit purposes — BR-C04.
 */
export class CancelOrderDto {
  /**
   * Mandatory reason for cancellation.
   * Stored in AuditLog and on the Order record.
   */
  @IsString()
  @MinLength(5, { message: 'Cancellation reason must be at least 5 characters' })
  @MaxLength(500, { message: 'Cancellation reason must not exceed 500 characters' })
  reason: string;
}
