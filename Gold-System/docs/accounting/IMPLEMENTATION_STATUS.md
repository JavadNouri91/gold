# Accounting Implementation Status

Last updated: 2026-11-07
Status: NOT STARTED — initial planning files only.

## Phase tracker
| Phase | Scope | Status | Evidence / notes |
|---|---|---|---|
| 0 | Existing system audit and architecture | NOT STARTED | No repository audit performed |
| 1 | Accounting core integrity | BLOCKED | Depends on Phase 0 |
| 2 | Customer accounting and statements | BLOCKED | Depends on verified ledger |
| 3 | Treasury and internal operations | BLOCKED | Depends on verified accounts |
| 4 | Gold inventory and backing policies | BLOCKED | Depends on gold ledger and risk decisions |
| 5 | Profitability and reports | BLOCKED | Depends on costing decisions |
| 6 | Five-page UX integration | BLOCKED | Depends on validated services |
| 7 | Reconciliation, security and release readiness | BLOCKED | Depends on prior phases |

## Known observations (UI only, not code-verified)
- Customer assets page already exists.
- Monetary and gold ledger admin pages already exist.
- Gold account labels GA-001, GA-002, GA-003 appeared in screenshots.
- Two backing modes requested; hybrid default requested.

## Phase 0 checklist
- [ ] Inspect repository architecture and technology stack.
- [ ] Identify existing monetary and gold models/tables/services.
- [ ] Map deposit, withdrawal, buy, sell, fee, rejection and delivery event flows.
- [ ] Inspect gold inventory, supplier and treasury support.
- [ ] Verify posting balancing, idempotency and reservation rules from code.
- [ ] Review actual schema and available read-only data; no financial writes.
- [ ] Document file paths and evidence for all findings.
- [ ] Produce gap analysis and risk register.
- [ ] Resolve or list blocking business decisions.
- [ ] Update all three documents based on verified findings.

## Decisions
- D-001: Reuse existing ledgers; no duplicate ledger architecture. Status: USER DIRECTION.
- D-002: Preserve existing customer assets dashboard and ledger pages where possible. Status: USER DIRECTION.
- D-003: Support full and hybrid backing, with hybrid requested as default. Status: USER DIRECTION; live risk/legal settings pending.
- D-004: Five primary accounting navigation pages maximum. Status: PLANNING TARGET.

## Issues and risks
- R-001: Existing journal balancing and gold posting semantics unknown. Severity: HIGH.
- R-002: Existing wallet vs ledger source of truth unknown. Severity: HIGH.
- R-003: Inventory backing and delivery settlement unknown. Severity: HIGH.
- R-004: Historical cost basis and profitability methodology unknown. Severity: HIGH.
- R-005: Hybrid backing legality and risk thresholds not yet approved. Severity: HIGH.

## Change log
- 2026-11-07: Created initial planning documents. No code, schema, or financial data modified.

## Phase handoff template
For each completed phase append:
- Date and phase
- Repository commit/hash if available
- Actual changes and file paths
- Migrations (dry-run/applied, environment)
- Tests executed and results (never assume pass)
- Reconciliation evidence
- Decisions taken and remaining blockers
- Next phase readiness
