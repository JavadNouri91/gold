import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Settlement Exceptions
 */

/** 404 — Settlement not found for a Trade. */
export class SettlementNotFoundException extends HttpException {
  constructor(tradeId: string) {
    super(
      {
        code: 'SETTLEMENT_NOT_FOUND',
        message: `No settlement record found for Trade "${tradeId}".`,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}

/**
 * 422 — Trade is already settled.
 * §8.1: Once 100% is paid, settlement is complete. Cannot settle again.
 */
export class TradeAlreadySettledException extends HttpException {
  constructor(tradeId: string) {
    super(
      {
        code: 'TRADE_ALREADY_SETTLED',
        message: `Trade "${tradeId}" is already fully settled. No further payments are accepted.`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
