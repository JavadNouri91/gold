import { HttpException, HttpStatus } from '@nestjs/common';

// ─── Financial Ledger Exceptions ─────────────────────────────────────────────

/** Thrown when a posting attempt would result in debits ≠ credits. */
export class UnbalancedTransactionException extends HttpException {
  constructor(totalDebits: string, totalCredits: string) {
    super(
      {
        code: 'UNBALANCED_TRANSACTION',
        message: `Double-entry balance violated: debits (${totalDebits}) ≠ credits (${totalCredits}). Transaction rejected.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Thrown when attempting to post to a BLOCKED or DEFERRED account. */
export class AccountNotActiveException extends HttpException {
  constructor(accountCode: string, reason: string) {
    super(
      {
        code: 'ACCOUNT_NOT_ACTIVE',
        message: `Cannot post to account ${accountCode}: ${reason}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Thrown when attempting to post to an unknown account code. */
export class UnknownAccountException extends HttpException {
  constructor(accountCode: string) {
    super(
      {
        code: 'UNKNOWN_ACCOUNT',
        message: `Account "${accountCode}" is not in the Chart of Accounts. Do not post to undocumented accounts.`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** Thrown when a required source reference is missing. */
export class MissingSourceReferenceException extends HttpException {
  constructor() {
    super(
      {
        code: 'MISSING_SOURCE_REFERENCE',
        message: 'Every ledger posting must reference a valid source transaction.',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

/** Thrown when attempting to create a duplicate posting (same idempotency key). */
export class DuplicatePostingException extends HttpException {
  constructor(idempotencyKey: string) {
    super(
      {
        code: 'DUPLICATE_POSTING',
        message: `A posting for idempotency key "${idempotencyKey}" already exists. Duplicate posting rejected.`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

/** Thrown when a ledger entry has an invalid amount (both debit and credit > 0, or both = 0). */
export class InvalidEntryAmountException extends HttpException {
  constructor(accountCode: string) {
    super(
      {
        code: 'INVALID_ENTRY_AMOUNT',
        message: `Entry for account ${accountCode}: exactly one of debit/credit must be > 0 and the other must be 0.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

/** Thrown when attempting to access a ledger journal that does not exist. */
export class LedgerJournalNotFoundException extends HttpException {
  constructor(id: string) {
    super(
      {
        code: 'LEDGER_JOURNAL_NOT_FOUND',
        message: `Financial ledger journal "${id}" not found.`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
