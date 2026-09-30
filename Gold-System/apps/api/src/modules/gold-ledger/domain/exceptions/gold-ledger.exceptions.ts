import { HttpException, HttpStatus } from '@nestjs/common';

// ─── Gold Ledger Exceptions ───────────────────────────────────────────────────

/** Thrown when attempting to post to an unknown gold account. */
export class UnknownGoldAccountException extends HttpException {
  constructor(accountCode: string) {
    super(
      {
        code: 'UNKNOWN_GOLD_ACCOUNT',
        message: `Gold account "${accountCode}" is not defined. Valid accounts: GA-01, GA-02, GA-03.`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** Thrown when attempting to post to a BLOCKED or DEFERRED gold account. */
export class GoldAccountNotActiveException extends HttpException {
  constructor(accountCode: string, reason: string) {
    super(
      {
        code: 'GOLD_ACCOUNT_NOT_ACTIVE',
        message: `Cannot post to gold account ${accountCode}: ${reason}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Thrown when a gold quantity is invalid (zero or negative). */
export class InvalidGoldQuantityException extends HttpException {
  constructor(quantity: string) {
    super(
      {
        code: 'INVALID_GOLD_QUANTITY',
        message: `Gold quantity must be positive. Received: ${quantity}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Thrown when attempting to create a duplicate gold posting. */
export class DuplicateGoldPostingException extends HttpException {
  constructor(idempotencyKey: string) {
    super(
      {
        code: 'DUPLICATE_GOLD_POSTING',
        message: `A gold posting for idempotency key "${idempotencyKey}" already exists. Duplicate posting rejected.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/** Thrown when a gold ledger journal is not found. */
export class GoldLedgerJournalNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      {
        code: 'GOLD_LEDGER_JOURNAL_NOT_FOUND',
        message: `Gold ledger journal "${id}" not found.`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
