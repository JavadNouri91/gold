import { IsString, MinLength, MaxLength } from 'class-validator';

/**
 * DTO for requesting revision of an Order after review.
 *
 * BR-O07: Revision must have trackable versioning/history.
 * STATE MACHINE: UNDER_REVIEW / ASSIGNED → REVISION_REQUESTED
 *
 * BLOCKER §8.3: The documentation (docs/08-workflows.md §8.3) states
 * "Customer/Operator Updates → New Quotation Version → Review Again",
 * but does NOT define what can be modified (price is locked at §2.1;
 * weight/purity are already set). The mechanism for creating a new
 * Quotation version after revision is NOT implemented in this phase.
 *
 * IMPLEMENTED: State transition UNDER_REVIEW → REVISION_REQUESTED
 * NOT IMPLEMENTED: REVISION_REQUESTED → QUOTED path (BLOCKED on §8.3)
 */
export class RequestRevisionDto {
  /** Mandatory reason explaining what needs to be revised */
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
