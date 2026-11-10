# Gold Platform — Accounting Rules

Status: PROPOSED POLICY BASELINE — NOT VERIFIED AGAINST REPOSITORY OR APPROVED FOR PRODUCTION.

## 1. Authority and source of truth
Reuse and audit the existing monetary ledger, gold ledger, wallet services, order services and inventory records. Do not establish a second ledger. Define which posted records are authoritative and which balances are derived projections after Phase 0.

## 2. Units and precision
- Monetary accounting base unit (rial or toman) must be discovered and documented; never silently mix them. UI may display toman using a centralized conversion.
- Gold ledger uses an explicitly documented canonical quantity/purity unit (e.g. grams at 750 purity or fine-gold equivalent); this is a decision, not a current-system fact.
- Use decimal/numeric types, not binary floating point. Document precision, rounding, conversion and valuation timestamps.
- Monetary journals balance per currency; gold quantity journals balance per compatible quantity unit IF the existing design is double-entry. If currently single-entry, report the gap and obtain approval before redesign.

## 3. Posting lifecycle
- Pending requests do not automatically equal settled transactions.
- Finalized entries are immutable; corrections use linked reversals/adjustments with reasons and audit logs.
- One economic event must post logically once; use idempotency and database concurrency protection.
- Atomicity or recoverable orchestration is required for events touching both ledgers.
- Separate total, reserved, available and pending balances.

## 4. Event policy matrix — audit and confirm
| Event | Customer monetary impact | Customer gold impact | Treasury/inventory impact | Posting trigger |
|---|---|---|---|---|
| Deposit | Increase entitlement | None | Increase verified cash/bank/clearing asset | Confirmed receipt |
| Withdrawal request | Reserve entitlement | None | None until settlement | Reservation only |
| Withdrawal settlement | Decrease entitlement | None | Decrease appropriate treasury asset | Verified settlement |
| Gold buy | Decrease entitlement + fee | Increase entitlement | Dealer exposure/inventory depends on actual settlement model | Executed/confirmed trade |
| Gold sell | Increase net entitlement | Decrease entitlement | Dealer exposure/inventory depends on actual settlement model | Executed/confirmed trade |
| Physical conversion request | Fee and/or reservation per contract | Reserve entitlement | Allocate stock only when eligible | Approved reservation |
| Physical delivery | Settle any outstanding fees | Reduce gold obligation | Reduce verified deliverable inventory | Proof of actual delivery |
| Cancellation/rejection | Release reservation or reverse prior posting | Same | Undo only actual effects | Verified state transition |
| Internal bank transfer | No customer impact | None | Transfer between own accounts; no revenue | Verified transfer/settlement |
| Supplier gold purchase | None | None | Supplier payable/cash + inventory only on verified receipt | Receipt and settlement events |
| Operating expense | None | None | Expense/payable and cash as applicable | Approved recognition/settlement |

This matrix is conceptual. Codex must determine exact debit/credit and gold quantity counterparts from real accounts and workflows before implementing.

## 5. Gold ownership, liability and backing
- Customer gold entitlement is a liability of the dealer under the contractual model, independent of physical coverage.
- Dealer-owned inventory, customer-owned custody, in-transit gold, unreceived procurement, and delivery reservations must be distinguished.
- Eligible backing excludes unverified, unreceived, disputed or otherwise ineligible gold; do not double count inventory.
- Coverage = eligible backing / outstanding customer gold liabilities; when liabilities are zero, report N/A / no outstanding liability, not an invented percentage.
- Uncovered grams = max(0, liabilities - eligible backing).
- Delivery requires sufficient verified deliverable stock in BOTH modes.

## 6. Backing modes
### FULL_PHYSICAL_BACKING
Require eligible backing >= outstanding customer gold liabilities. Block transactions that would create a coverage breach unless a verified, approved atomic funding/receipt process ensures coverage. Show shortfalls and remediation.

### HYBRID_ON_DEMAND
Requested default for previously unconfigured systems only. Fully recognize customer liabilities; expose actual coverage, uncovered grams, procurement pipeline and risk limits. Do not automatically allow unlimited uncovered exposure. Require configured limits, legal review and authorization before live activation.

Switching policies requires permission, reason, effective time, history, coverage preview and no retroactive rewriting. A switch to full mode while under-covered must not be reported as compliant.

## 7. Profit and loss
- Separate customer investment performance from profitability of that customer to the dealer.
- Gross trade turnover is not revenue; avoid double counting spreads and fees.
- Separate realized P&L, unrealized mark-to-market, fee revenue, cost of goods sold and operating expenses.
- Historical trade prices and fees are immutable. Unknown cost basis must be disclosed, not invented.
- Inventory cost method (FIFO vs weighted average), expense allocations and group membership history require explicit decisions.

## 8. Controls
- Reconcile aggregate customer monetary entitlements to liability control accounts.
- Reconcile aggregate customer gold entitlements to gold obligations.
- Reconcile treasury bank/cash accounts and gold physical inventory with ledgers.
- Never use adjustment accounts to hide discrepancies.
- Backend permissions for financial reads, exports, approvals, policy changes and adjustments.
- Period close and audit logging must be defined and tested.

## 9. Open decisions for Phase 0
1. Actual monetary base unit and display conversion.
2. Canonical gold purity/unit and rounding precision.
3. Whether existing gold ledger is double-entry or quantity event tracking.
4. When trade ownership, risk and inventory actually transfer.
5. Cost basis and dealer/customer profit methods.
6. Coverage-eligible custody and inventory definitions.
7. Minimum hybrid coverage, max uncovered exposure and block/approval thresholds.
8. Regulatory/contractual permission for hybrid backing.
9. Historical migration/cutover strategy and accounting period policy.
