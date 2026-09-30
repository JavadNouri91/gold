import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Thrown when an Assignment is not found.
 * Returns 404 (not 403) to prevent enumeration.
 */
export class AssignmentNotFoundException extends HttpException {
  constructor(assignmentId: string) {
    super(
      {
        statusCode: HttpStatus.NOT_FOUND,
        error: 'ASSIGNMENT_NOT_FOUND',
        message: `Assignment '${assignmentId}' not found.`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * Thrown when an Order is not in a state that can be assigned.
 * Only QUOTED orders may be assigned (state machine: QUOTED → ASSIGNED).
 */
export class OrderNotAssignableException extends HttpException {
  constructor(orderId: string, currentStatus: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'ORDER_NOT_ASSIGNABLE',
        message: `Order '${orderId}' cannot be assigned from status '${currentStatus}'. Only QUOTED orders can be assigned.`,
        details: { orderId, currentStatus, requiredStatus: 'QUOTED' },
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Thrown when an Order cannot transition to UNDER_REVIEW.
 * Only ASSIGNED orders can start review.
 */
export class OrderNotUnderReviewException extends HttpException {
  constructor(orderId: string, currentStatus: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'ORDER_NOT_ASSIGNED',
        message: `Order '${orderId}' cannot start review from status '${currentStatus}'. Only ASSIGNED orders can start review.`,
        details: { orderId, currentStatus, requiredStatus: 'ASSIGNED' },
      },
      HttpStatus.CONFLICT,
    );
  }
}

/**
 * Thrown when a review action is attempted on an Order that has no active Assignment.
 */
export class NoActiveAssignmentException extends HttpException {
  constructor(orderId: string) {
    super(
      {
        statusCode: HttpStatus.CONFLICT,
        error: 'NO_ACTIVE_ASSIGNMENT',
        message: `Order '${orderId}' has no active assignment. Assign the order before reviewing.`,
        details: { orderId },
      },
      HttpStatus.CONFLICT,
    );
  }
}
