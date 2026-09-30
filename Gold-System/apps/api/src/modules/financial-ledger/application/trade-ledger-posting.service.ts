import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { FinancialLedgerService } from './financial-ledger.service';
import { GoldLedgerService } from '../../gold-ledger/application/gold-ledger.service';
import { AuditService } from '../../audit/application/audit.service';

// ─── Trade Ledger Posting Service ────────────────────────────────────────────

/**
 * Orchestrates financial and gold ledger postings for Trade lifecycle events.
 *
 * ======================================================================
 * DOCUMENTED TRADE POSTINGS (docs/21-business-decisions.md §6, §14):
 * ======================================================================
 *
 * TRADE CONFIRMED posting:
 *   Financial Ledger:
 *     DR FA-02 (Customer Prepaid/Deposit) : trade.totalAmountRial
 *     CR FA-06 (Sales Revenue)            : trade.totalAmountRial
 *   Rationale: Customer uses prepaid balance (§3.1, FA-02 is Liability);
 *              revenue recognized at Trade confirmation (FA-06 Revenue).
 *
 *   Gold Ledger:
 *     GA-02 (Gold Obligation) IN : trade.weightGrams / trade.purityRatio
 *   Rationale: GA-02 = "Gold committed to customer via confirmed Trade" (§6.2).
 *              When Trade is confirmed, store creates obligation to deliver.
 *
 * ======================================================================
 * BLOCKED POSTINGS (MUST NOT BE IMPLEMENTED):
 * ======================================================================
 *
 * FA-07 (Sales Profit):
 *   BLOCKED — docs/21-business-decisions.md §13.2
 *   Profit calculation base is OPEN question #35.
 *   Do NOT post to FA-07 until §13.2 is resolved.
 *
 * FA-09 (Tax Payable):
 *   BLOCKED — docs/21-business-decisions.md §13.3
 *   Tax percentage and taxable base are OPEN question #36.
 *   Do NOT post to FA-09 until §13.3 is resolved.
 *
 * FA-10 (Discount Expense) — SEPARATE LINE:
 *   AMBIGUOUS — no explicit Debit/Credit posting rule documented for discount
 *   in the financial ledger context. The discountAmount is already reflected
 *   in totalAmountRial (the final price). Separate FA-10 line is NOT posted
 *   until the posting rule is formally documented.
 *
 * GA-01 (Store Gold Position) at Trade Confirmation:
 *   BLOCKED — open-questions.md #39
 *   Whether GA-01 decreases at Trade confirmation or at delivery/settlement
 *   is NOT documented. GA-01 is only updated by confirmed purchases.
 *   Do NOT update GA-01 at Trade confirmation until #39 is resolved.
 *
 * ======================================================================
 * TRADE REVERSED posting:
 * ======================================================================
 *   Exact reversal of the confirmation posting:
 *   Financial Ledger:
 *     DR FA-06 (Sales Revenue)            : trade.totalAmountRial  (reversal)
 *     CR FA-02 (Customer Prepaid/Deposit) : trade.totalAmountRial  (reversal)
 *   Gold Ledger:
 *     GA-02 (Gold Obligation) OUT : trade.weightGrams / trade.purityRatio (reversal)
 *
 * Source: docs/14-accounting.md, docs/21-business-decisions.md §4.2, §6.1, §6.2
 */
@Injectable()
export class TradeLedgerPostingService {
  private readonly logger = new Logger(TradeLedgerPostingService.name);

  constructor(
    private readonly financialLedger: FinancialLedgerService,
    private readonly goldLedger: GoldLedgerService,
    private readonly audit: AuditService,
  ) {}

  // ─── Idempotency Key Generators ───────────────────────────────────────────────

  static financialKeyForConfirm(tradeId: string): string {
    return `TRADE_CONFIRM_FIN_${tradeId}`;
  }

  static goldKeyForConfirm(tradeId: string): string {
    return `TRADE_CONFIRM_GOLD_${tradeId}`;
  }

  static financialKeyForReversal(tradeId: string): string {
    return `TRADE_REVERSAL_FIN_${tradeId}`;
  }

  static goldKeyForReversal(tradeId: string): string {
    return `TRADE_REVERSAL_GOLD_${tradeId}`;
  }

  // ─── Trade Confirmation Posting ───────────────────────────────────────────────

  /**
   * Posts financial and gold ledger entries for a confirmed Trade.
   *
   * MUST be called inside the Trade confirmation Prisma transaction
   * to ensure atomicity: if either posting fails, the entire transaction
   * (including the Trade record itself) rolls back.
   *
   * Idempotency: safe to call multiple times — duplicate calls return the
   * existing journal without creating new entries.
   *
   * @param tx              Prisma transaction client (from Trade confirmation tx)
   * @param trade           Confirmed Trade data
   * @param actorUserId     User who confirmed the Trade
   */
  async postTradeConfirmInTx(
    tx: Prisma.TransactionClient,
    trade: {
      id: string;
      tradeNumber: string;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      discountAmount: Decimal | null;
      customerId: string;
    },
    actorUserId: string,
  ): Promise<void> {
    const finKey = TradeLedgerPostingService.financialKeyForConfirm(trade.id);
    const goldKey = TradeLedgerPostingService.goldKeyForConfirm(trade.id);

    // ─── Financial Ledger Posting ─────────────────────────────────────────────
    //
    // Documented posting for Trade Confirmed (docs/14-accounting.md):
    //   DR FA-02 (Customer Prepaid/Deposit) : totalAmountRial
    //   CR FA-06 (Sales Revenue)            : totalAmountRial
    //
    // BLOCKED: FA-07 (profit) — §13.2; FA-09 (tax) — §13.3; FA-10 (discount) — rule unclear
    //
    const { wasAlreadyPosted: finAlreadyPosted } = await this.financialLedger.postJournalInTx(tx, {
      idempotencyKey: finKey,
      sourceType: 'TRADE_CONFIRM',
      sourceId: trade.id,
      description: `Trade ${trade.tradeNumber} confirmed — customer prepaid debit / sales revenue credit`,
      postedByUserId: actorUserId,
      entries: [
        {
          // DR FA-02: Customer Prepaid/Deposit (Liability ↓ = Debit)
          accountCode: 'FA-02',
          debit: trade.totalAmountRial,
          credit: new Decimal(0),
          description: `Trade ${trade.tradeNumber}: customer prepaid balance consumed`,
        },
        {
          // CR FA-06: Sales Revenue (Revenue ↑ = Credit)
          accountCode: 'FA-06',
          debit: new Decimal(0),
          credit: trade.totalAmountRial,
          description: `Trade ${trade.tradeNumber}: sales revenue recognized`,
        },
      ],
    });

    // ─── Gold Ledger Posting ──────────────────────────────────────────────────
    //
    // Documented posting for Trade Confirmed (docs/21-business-decisions.md §6.2):
    //   GA-02 IN: gold obligation created (store commits to deliver weightGrams)
    //
    // BLOCKED: GA-01 posting — when GA-01 changes at Trade confirmation vs delivery
    //          is not documented (open-questions.md #39).
    //
    const { wasAlreadyPosted: goldAlreadyPosted } = await this.goldLedger.postJournalInTx(tx, {
      idempotencyKey: goldKey,
      sourceType: 'TRADE_CONFIRM',
      sourceId: trade.id,
      description: `Trade ${trade.tradeNumber} confirmed — gold obligation created`,
      postedByUserId: actorUserId,
      entries: [
        {
          accountCode: 'GA-02',
          direction: 'IN',
          quantity: trade.weightGrams,
          purity: trade.purityRatio,
          description: `Trade ${trade.tradeNumber}: gold obligation to customer`,
        },
      ],
    });

    if (finAlreadyPosted || goldAlreadyPosted) {
      this.logger.warn(
        `[TradeLedger] Trade ${trade.tradeNumber}: ledger posting was already done (idempotent call). ` +
          `fin=${finAlreadyPosted}, gold=${goldAlreadyPosted}`,
      );
    } else {
      this.logger.log(
        `[TradeLedger] Trade ${trade.tradeNumber}: financial and gold ledger postings created. ` +
          `FA-02 DR ${trade.totalAmountRial.toFixed(2)} / FA-06 CR ${trade.totalAmountRial.toFixed(2)} | ` +
          `GA-02 IN ${trade.weightGrams.toFixed(6)}g purity=${trade.purityRatio.toFixed(4)}`,
      );
    }
  }

  // ─── Trade Reversal Posting ───────────────────────────────────────────────────

  /**
   * Posts reversal ledger entries for a REVERSED Trade.
   *
   * Exactly reverses the confirmation posting:
   *   Financial: DR FA-06 / CR FA-02 for totalAmountRial
   *   Gold:      GA-02 OUT for weightGrams (obligation released)
   *
   * MUST be called inside the Trade reversal Prisma transaction.
   *
   * @param tx          Prisma transaction client
   * @param trade       Reversed Trade data
   * @param actorUserId User performing the reversal
   * @param reason      Documented reversal reason (mandatory per §4.2)
   */
  async postTradeReversalInTx(
    tx: Prisma.TransactionClient,
    trade: {
      id: string;
      tradeNumber: string;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
    },
    actorUserId: string,
    reason: string,
  ): Promise<void> {
    const finKey = TradeLedgerPostingService.financialKeyForReversal(trade.id);
    const goldKey = TradeLedgerPostingService.goldKeyForReversal(trade.id);

    // ─── Financial Reversal ───────────────────────────────────────────────────
    const { wasAlreadyPosted: finAlreadyPosted } = await this.financialLedger.postJournalInTx(tx, {
      idempotencyKey: finKey,
      sourceType: 'TRADE_REVERSAL',
      sourceId: trade.id,
      description: `Trade ${trade.tradeNumber} REVERSED — reason: ${reason}`,
      postedByUserId: actorUserId,
      entries: [
        {
          // DR FA-06: Sales Revenue reversal (Revenue ↓ = Debit)
          accountCode: 'FA-06',
          debit: trade.totalAmountRial,
          credit: new Decimal(0),
          description: `Trade ${trade.tradeNumber} reversal: sales revenue reversed`,
        },
        {
          // CR FA-02: Customer Prepaid/Deposit restored (Liability ↑ = Credit)
          accountCode: 'FA-02',
          debit: new Decimal(0),
          credit: trade.totalAmountRial,
          description: `Trade ${trade.tradeNumber} reversal: customer prepaid balance restored`,
        },
      ],
    });

    // ─── Gold Reversal ────────────────────────────────────────────────────────
    const { wasAlreadyPosted: goldAlreadyPosted } = await this.goldLedger.postJournalInTx(tx, {
      idempotencyKey: goldKey,
      sourceType: 'TRADE_REVERSAL',
      sourceId: trade.id,
      description: `Trade ${trade.tradeNumber} REVERSED — gold obligation released`,
      postedByUserId: actorUserId,
      entries: [
        {
          accountCode: 'GA-02',
          direction: 'OUT',
          quantity: trade.weightGrams,
          purity: trade.purityRatio,
          description: `Trade ${trade.tradeNumber} reversal: gold obligation released`,
        },
      ],
    });

    if (finAlreadyPosted || goldAlreadyPosted) {
      this.logger.warn(
        `[TradeLedger] Reversal for Trade ${trade.tradeNumber}: some/all postings already done (idempotent). ` +
          `fin=${finAlreadyPosted}, gold=${goldAlreadyPosted}`,
      );
    } else {
      this.logger.log(
        `[TradeLedger] Trade ${trade.tradeNumber} REVERSED: financial and gold ledger reversal postings created.`,
      );
    }

    // Audit the reversal posting
    await this.audit.log({
      actorId: actorUserId,
      actorType: 'USER',
      action: 'LEDGER_TRADE_REVERSAL_POSTED',
      entityType: 'Trade',
      entityId: trade.id,
      after: {
        financialIdempotencyKey: finKey,
        goldIdempotencyKey: goldKey,
        reversalReason: reason,
        totalAmountRial: trade.totalAmountRial.toFixed(2),
        weightGrams: trade.weightGrams.toFixed(6),
        wasAlreadyPosted: finAlreadyPosted || goldAlreadyPosted,
      },
      reason,
    });
  }
}
