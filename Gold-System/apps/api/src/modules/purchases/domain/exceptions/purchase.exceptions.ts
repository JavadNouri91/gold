import { HttpException, HttpStatus } from '@nestjs/common';

export class PurchaseNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      { code: 'PURCHASE_NOT_FOUND', message: `Purchase "${id}" not found` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidPurchaseTransitionException extends HttpException {
  constructor(purchaseId: string, from: string, to: string) {
    super(
      {
        code: 'INVALID_PURCHASE_TRANSITION',
        message: `Purchase "${purchaseId}" cannot transition from "${from}" to "${to}"`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InvalidPurchaseAmountException extends HttpException {
  constructor(amount: string) {
    super(
      {
        code: 'INVALID_PURCHASE_AMOUNT',
        message: `Purchase amount "${amount}" is invalid. Must be a positive Decimal.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InvalidPurchaseWeightException extends HttpException {
  constructor(weight: string) {
    super(
      {
        code: 'INVALID_PURCHASE_WEIGHT',
        message: `Purchase weight "${weight}" is invalid. Must be a positive Decimal (grams).`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class DuplicatePurchaseException extends HttpException {
  constructor(idempotencyKey: string) {
    super(
      {
        code: 'DUPLICATE_PURCHASE',
        message: `A purchase with idempotency key "${idempotencyKey}" already exists.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class PurchaseAlreadyConfirmedException extends HttpException {
  constructor(purchaseId: string) {
    super(
      {
        code: 'PURCHASE_ALREADY_CONFIRMED',
        message: `Purchase "${purchaseId}" is already CONFIRMED.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class PurchaseSupplierSettlementDeferredException extends HttpException {
  constructor() {
    super(
      {
        code: 'SUPPLIER_SETTLEMENT_DEFERRED',
        message:
          'Supplier settlement is DEFERRED from MVP (docs/21-business-decisions.md §8.4). Only DRAFT→CONFIRMED is operational.',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
