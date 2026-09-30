import { IsString, IsOptional, MaxLength } from 'class-validator';

/**
 * DTO for assigning an Order to a staff member (reviewer/seller).
 *
 * UC-09: Operator assigns Order to Reviewer.
 * Permission: order.assign
 */
export class AssignOrderDto {
  /** userId of the staff member being assigned to review this Order */
  @IsString()
  assignedToUserId!: string;

  /** Optional context/instructions for the reviewer */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
