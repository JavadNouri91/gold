import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO for approving an Order after manual review.
 *
 * §5.1: Any user with trade.approve permission may approve.
 * APPROVAL: Order → APPROVED (no Trade created in this phase)
 * CREDIT: NOT consumed at this stage — consumption happens at Trade approval (§3.3)
 *
 * DUAL APPROVAL: §13.4 — OPEN (threshold and second approver role undefined)
 * This implementation supports single approval only.
 * Dual approval is BLOCKED pending §13.4 resolution.
 */
export class ApproveOrderDto {
  /** Optional approval notes / comments for the audit trail */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
