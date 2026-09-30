import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

import { FinancialLedgerService } from '../../financial-ledger/application/financial-ledger.service';

/**
 * Purchase Ledger Posting Service
 *
 * Orchestrates financial ledger postings for Purchase lifecycle events.
 *
 * =====================================================================
 * DOCUMENTED PURCHASE POSTINGS
 * =====================================================================
 *
 * Source authorities:
 *   - docs/14-accounting.md — "Purchase Confirmed → supplier payable/cash impact"
 *   - docs/21-business-decisions.md §6.1 — FA-03 (Supplier Payable), FA-08 (Purchase Cost)
 *   - docs/07-business-rules.md BR-U03 — "Purchase must create accounting effect"
 *
 * PURCHASE CONFIRMED — Financial Ledger posting:
 *   DR FA-08 (Purchase Cost — Expense)      : totalAmountRial
 *   CR FA-03 (Supplier Payable — Liability) : totalAmountRial
 *
 *   Rationale:
 *   - FA-08: "Cost of upstream gold purchases" — Expense account; Debit increases it
 *   - FA-03: "Amount store owes to upstream supplier" — Liability; Credit increases it
 *   - The "supplier payable/cash impact" description from docs/14-accounting.md
 *     maps to this DR/CR pattern for a credit purchase (not immediate cash payment).
 *
 * =====================================================================
 * GOLD LEDGER — BLOCKED
 * =====================================================================
 *
 * GA-01 (Store Gold Position) IN posting is BLOCKED.
 *
 * Two open questions remain unresolved:
 *   #22: "خرید طلایی چگونه در Gold Ledger ثبت می‌شود؟" — OPEN
 *   #39: "Gold purchase from upstream: which Gold Ledger account is credited (GA-01)?
 *          Posting rules?" — OPEN
 *
 * This is CONSISTENT with Phase 4's decision:
 *   TradeLedgerPostingService also blocked GA-01 at Trade confirmation citing #39.
 *
 * Per implementation rule: "DO NOT invent accounting rules. If an accounting rule
 * is missing or ambiguous: STOP that specific implementation and report."
 *
 * ⚠️ GA-01 posting for Purchase Confirmed remains BLOCKED until #22 and #39
 * are resolved in docs/21-business-decisions.md.
 *
 * =====================================================================
 * SUPPLIER SETTLEMENT — DEFERRED
 * =====================================================================
 *
 * Supplier settlement reversal postings are DEFERRED §8.4.
 * No FA-03 debit entries are posted until the supplier settlement workflow
 * is implemented (future phase).
 */
@Injectable()
export class PurchaseLedgerService {
  private readonly logger = new Logger(PurchaseLedgerService.name);

  constructor(private readonly financialLedger: FinancialLedgerService) {}

  // ─── Idempotency Key Generators ───────────────────────────────────────────────

  static financialKeyForConfirm(purchaseId: string): string {
    return `PURCHASE_CONFIRM_FIN_${purchaseId}`;
  }

  // Gold key defined but NOT used until #22/#39 resolved
  static goldKeyForConfirm(purchaseId: string): string {
    return `PURCHASE_CONFIRM_GOLD_${purchaseId}`;
  }

  // ─── Purchase Confirmation Posting ────────────────────────────────────────────

  /**
   * Posts financial ledger entries for a CONFIRMED Purchase.
   *
   * MUST be called inside the Purchase confirmation Prisma transaction
   * to ensure atomicity.
   *
   * Posting:
   *   DR FA-08 (Purchase Cost — Expense)      : purchase.totalAmountRial
   *   CR FA-03 (Supplier Payable — Liability) : purchase.totalAmountRial
   *
   * @param tx            Prisma transaction client
   * @param purchase      Confirmed purchase data
   * @param actorUserId   User who confirmed the purchase
   */
  async postPurchaseConfirmInTx(
    tx: Prisma.TransactionClient,
    purchase: {
      id: string;
      purchaseNumber: string;
      totalAmountRial: Decimal;
      weightGrams: Decimal;
      purityRatio: Decimal;
      supplierId: string;
    },
    actorUserId: string,
  ): Promise<void> {
    const finKey = PurchaseLedgerService.financialKeyForConfirm(purchase.id);

    // ─── Financial Ledger Posting ───────────────────────────────────────────
    // DR FA-08 (Purchase Cost) / CR FA-03 (Supplier Payable)
    // Source: docs/14-accounting.md + §6.1 account descriptions
    const { wasAlreadyPosted } = await this.financialLedger.postJournalInTx(tx, {
      idempotencyKey: finKey,
      sourceType: 'PURCHASE_CONFIRM',
      sourceId: purchase.id,
      description: `Purchase ${purchase.purchaseNumber} confirmed — purchase cost DR / supplier payable CR`,
      postedByUserId: actorUserId,
      entries: [
        {
          // DR FA-08: Purchase Cost (Expense ↑ = Debit)
          accountCode: 'FA-08',
          debit: purchase.totalAmountRial,
          credit: new Decimal(0),
          description: `Purchase ${purchase.purchaseNumber}: gold purchase cost recognized`,
        },
        {
          // CR FA-03: Supplier Payable (Liability ↑ = Credit)
          accountCode: 'FA-03',
          credit: purchase.totalAmountRial,
          debit: new Decimal(0),
          description: `Purchase ${purchase.purchaseNumber}: supplier payable created`,
        },
      ],
    });

    // ─── Gold Ledger Posting — BLOCKED ─────────────────────────────────────
    //
    // GA-01 (Store Gold Position) IN for weightGrams/purityRatio is BLOCKED.
    // open-questions.md #22 and #39 are OPEN — exact rules TBD.
    // When resolved, post: GA-01 IN for weightGrams at purityRatio
    //
    this.logger.warn(
      `[PurchaseLedger] Purchase ${purchase.purchaseNumber}: Gold Ledger (GA-01 IN) posting ` +
        `is BLOCKED — open-questions.md #22 and #39 unresolved.`,
    );

    if (wasAlreadyPosted) {
      this.logger.warn(
        `[PurchaseLedger] Purchase ${purchase.purchaseNumber}: financial ledger already posted (idempotent call).`,
      );
    } else {
      this.logger.log(
        `[PurchaseLedger] Purchase ${purchase.purchaseNumber}: ` +
          `FA-08 DR ${purchase.totalAmountRial.toFixed(2)} / FA-03 CR ${purchase.totalAmountRial.toFixed(2)}`,
      );
    }
  }
}
