import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for rejecting an order (staff action).
 * A rejection reason is mandatory — documents reviewer decision for audit.
 */
export class RejectOrderDto {
  /**
   * Mandatory reason for rejection.
   * Stored in AuditLog and on the Order record.
   */
  @IsString()
  @MinLength(5, { message: 'Rejection reason must be at least 5 characters' })
  @MaxLength(1000, { message: 'Rejection reason must not exceed 1000 characters' })
  reason: string;
}
