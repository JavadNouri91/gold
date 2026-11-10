# Gold Platform Accounting — Master Plan

Status: INITIAL DRAFT — pending Phase 0 repository audit.

## Mission
Extend the existing gold trading platform with a coherent, auditable accounting, treasury, gold inventory, backing-policy, and reporting system. Reuse existing financial and gold ledgers; do not create competing sources of truth.

## Known from user-provided UI (not code-verified)
- Customer page: «دارایی‌های من» with monetary/gold balances, valuations and charts.
- Admin pages: «دفتر مالی» and «دفتر طلا» with journal/account displays.
- Gold ledger UI appears to show GA-001 Store Gold Inventory, GA-002 Gold Obligation to Customer, GA-003 Gold Reversal / Adjustment.
- Existing workflows include deposits, withdrawals, live-price gold trades, fees and physical delivery/conversion.
- Gold backing policy must offer FULL_PHYSICAL_BACKING and HYBRID_ON_DEMAND. Requested default: HYBRID_ON_DEMAND, subject to legal and risk-policy approval; never override an existing configured setting.

All details above require verification against source code and database schema.

## Product architecture — maximum five primary accounting pages
1. Customer «دارایی‌های من» — EXISTING; retain and integrate, no duplicate dashboard.
2. Customer «گردش حساب و صورتحساب» — new only if equivalent is absent.
3. Admin «داشبورد مالی و خزانه» — reuse/extend existing admin surface where possible.
4. Admin «حساب مشتریان» — balances, statements, customer and group profitability.
5. Admin «دفتر کل و عملیات مالی» — consolidate existing «دفتر مالی» and «دفتر طلا» as tabs or linked views, plus operations, suppliers, inventory, reconciliation and reporting.

These are navigation targets, not a requirement to delete existing routes. Preserve deep links and workflows.

## Core domains
- Monetary general ledger and customer monetary liabilities.
- Gold quantity ledger, customer gold liabilities, physical inventory, reservations, purity normalization.
- Treasury: cash, bank, gateways, internal transfers, suppliers, expenses, owner transactions.
- Backing policies: full 100% eligible physical backing; hybrid/on-demand with explicit risk thresholds, shortage reporting and compliant authorization.
- Trade/fee/physical-delivery posting lifecycle and idempotency.
- Profitability: customer investment performance, dealer margin per customer/group, company P&L, realized vs unrealized valuation.
- Reconciliation, audit trail, permissions, period closing, reporting and exports.

## Delivery phases
- Phase 0: Read-only audit and architecture. Produce file-level evidence, ledger event maps, risks, decisions and implementation design. No application or database changes.
- Phase 1: Verify/repair accounting core, posting rules, reversals, reservations, precision and idempotency. No unapproved historical rewrites.
- Phase 2: Customer statements, unified activity and performance integration with existing assets UI.
- Phase 3: Treasury, bank/cash, suppliers, internal transfers, operating expenses and owner operations.
- Phase 4: Physical gold inventory, custody, delivery, procurement and two backing modes (default hybrid subject to approvals).
- Phase 5: Customer, group and business profitability, cost basis, financial reporting and exports.
- Phase 6: Final unified UX across five primary accounting pages, preserving existing functionality.
- Phase 7: End-to-end reconciliation, security, migration/cutover, load and concurrency tests, rollout readiness.

## Cross-phase constraints
- Monetary and gold units must never be combined in a single balancing equation.
- Exact decimal arithmetic; explicit rial/toman and gold purity conventions.
- Customer liabilities are not unrestricted dealer assets.
- Finalized postings immutable; corrections through auditable reversals.
- No duplicate posting, negative available balances without explicit policy, or inventory fabrication.
- Physical delivery cannot settle without verified deliverable inventory.
- No destructive migrations, production posting, or deployment without explicit approval.
- Compliance and contract terms override configurable backing preference.

## Phase gate and documentation contract
At the start of each phase read MASTER_PLAN.md, ACCOUNTING_RULES.md and IMPLEMENTATION_STATUS.md, then inspect current code. At the end record implemented changes, evidence, tests, unresolved risks and next-phase dependencies. A phase is complete only after acceptance criteria and tests are evidenced.

## Phase 0 deliverables
1. Verified repository architecture and existing feature inventory.
2. Table/model/service/API/route map with paths.
3. Existing monetary and gold posting matrix for every event.
4. Ledger-to-wallet and inventory reconciliation feasibility and findings (read-only).
5. Gap analysis against this plan; retain/modify/create decision for each capability.
6. Explicit decisions needed from business owner before Phase 1.
7. Revised three docs with confirmed findings clearly separated from assumptions.
