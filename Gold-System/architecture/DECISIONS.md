# Architecture Decision Records

## ADR-001 — Modular Monolith
**Decision:** Backend as Modular Monolith.

**Reason:** User volume and complexity do not justify microservices currently.

## ADR-002 — PostgreSQL
**Decision:** PostgreSQL.

**Reason:** Strong relational consistency and transaction support.

## ADR-003 — TypeScript End-to-End
**Decision:** TypeScript for frontend and backend.

**Reason:** One language, easier AI-assisted development, shared types.

## ADR-004 — Prisma
**Decision:** Prisma as ORM.

**Reason:** Strong developer experience and good Cursor compatibility.

## ADR-005 — Ledger Based Accounting
**Decision:** Financial and Gold balances derive from ledger transactions.

**Reason:** Traceability and correction through reversal.

## ADR-006 — Order != Trade
**Decision:** Order and Trade are separate domain concepts.

**Reason:** Customer order is not automatically a legally/business-finalized transaction.

## ADR-007 — Manual Approval
**Decision:** Manual review is mandatory before Trade confirmation.

**Reason:** Current business process requires human verification.

## ADR-008 — Redis Optional
**Decision:** Redis is not mandatory for MVP.

**Reason:** Current scale does not require distributed caching/queue infrastructure.
