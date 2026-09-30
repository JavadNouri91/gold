-- Phase 4: Financial Ledger + Gold Ledger
-- Migration: Add FinancialLedgerJournal, FinancialLedgerEntry, GoldLedgerJournal, GoldLedgerEntry
--
-- Source: docs/21-business-decisions.md §6.1 (Financial Chart of Accounts), §6.2 (Gold Accounts)
-- Architecture: docs/14-accounting.md, docs/07-business-rules.md BR-L01, BR-L02, BR-L03
--
-- IMMUTABILITY RULE (BR-L02):
--   No UPDATE or DELETE statements should ever run against these tables.
--   Application-level constraints enforce write-once behavior.
--   Corrections use reversal entries.
--
-- IDEMPOTENCY:
--   Unique constraint on idempotency_key in journal tables prevents duplicate postings.
--
-- DOUBLE-ENTRY INVARIANT (enforced at application layer):
--   For every financial_ledger_journal, SUM(debit) = SUM(credit) across its entries.
--
-- BLOCKED ACCOUNTS (not postable in MVP — see chart-of-accounts.ts):
--   FA-07: §13.2 — profit base undefined
--   FA-09: §13.3 — tax rate/base undefined
--   FA-13: §8.4 — supplier settlement deferred
--
-- BLOCKED GOLD POSTINGS:
--   GA-01 at Trade confirmation: open-questions.md #39 — posting rule unclear

-- ─── Financial Ledger Journal ─────────────────────────────────────────────────
-- Groups all debit/credit entries for one atomic posting event.
-- Unique idempotency_key enforces: exactly one posting per source event.

CREATE TABLE "financial_ledger_journals" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_by_user_id" TEXT,

    CONSTRAINT "financial_ledger_journals_pkey" PRIMARY KEY ("id")
);

-- ─── Financial Ledger Entry ───────────────────────────────────────────────────
-- Individual debit or credit line. WRITE-ONCE (no UPDATE/DELETE).
-- Double-entry: exactly one of debit/credit > 0 per entry (application enforced).
-- All monetary amounts: DECIMAL(20,2) — BR-P05 (never Float).

CREATE TABLE "financial_ledger_entries" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,       -- FA-01 through FA-15
    "account_name" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,       -- ASSET | LIABILITY | REVENUE | EXPENSE | CLEARING
    "debit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'IRR',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- ─── Gold Ledger Journal ──────────────────────────────────────────────────────
-- Groups gold movement entries for one atomic posting event.
-- Unique idempotency_key prevents duplicate gold postings.

CREATE TABLE "gold_ledger_journals" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "description" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "posted_by_user_id" TEXT,

    CONSTRAINT "gold_ledger_journals_pkey" PRIMARY KEY ("id")
);

-- ─── Gold Ledger Entry ────────────────────────────────────────────────────────
-- Individual gold weight movement. WRITE-ONCE (no UPDATE/DELETE).
-- All quantities: DECIMAL(20,6) — BR-P05 (never Float).
-- Accounts: GA-01 (Store Position), GA-02 (Customer Obligation), GA-03 (Reversal).
-- Note: Customer gold capacity is Rial-based (customer_accounts.credit_limit_gold_rial).
--       GoldLedgerEntry belongs to store-level accounts only.

CREATE TABLE "gold_ledger_entries" (
    "id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "account_code" TEXT NOT NULL,       -- GA-01 | GA-02 | GA-03
    "account_name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,          -- IN | OUT
    "quantity" DECIMAL(20,6) NOT NULL,  -- weight in grams
    "purity" DECIMAL(10,6) NOT NULL,    -- e.g. 0.750 for 18K
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- ─── Unique Constraints (Idempotency) ─────────────────────────────────────────

CREATE UNIQUE INDEX "financial_ledger_journals_idempotency_key_key"
    ON "financial_ledger_journals"("idempotency_key");

CREATE UNIQUE INDEX "gold_ledger_journals_idempotency_key_key"
    ON "gold_ledger_journals"("idempotency_key");

-- ─── Indexes ───────────────────────────────────────────────────────────────────

-- Financial journals: lookup by source event
CREATE INDEX "financial_ledger_journals_source_type_source_id_idx"
    ON "financial_ledger_journals"("source_type", "source_id");

CREATE INDEX "financial_ledger_journals_posted_at_idx"
    ON "financial_ledger_journals"("posted_at");

-- Financial entries: lookup by journal (for balance queries), by account
CREATE INDEX "financial_ledger_entries_journal_id_idx"
    ON "financial_ledger_entries"("journal_id");

CREATE INDEX "financial_ledger_entries_account_code_idx"
    ON "financial_ledger_entries"("account_code");

CREATE INDEX "financial_ledger_entries_created_at_idx"
    ON "financial_ledger_entries"("created_at");

-- Gold journals: lookup by source event
CREATE INDEX "gold_ledger_journals_source_type_source_id_idx"
    ON "gold_ledger_journals"("source_type", "source_id");

CREATE INDEX "gold_ledger_journals_posted_at_idx"
    ON "gold_ledger_journals"("posted_at");

-- Gold entries: lookup by journal, by account
CREATE INDEX "gold_ledger_entries_journal_id_idx"
    ON "gold_ledger_entries"("journal_id");

CREATE INDEX "gold_ledger_entries_account_code_idx"
    ON "gold_ledger_entries"("account_code");

CREATE INDEX "gold_ledger_entries_created_at_idx"
    ON "gold_ledger_entries"("created_at");

-- ─── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE "financial_ledger_entries"
    ADD CONSTRAINT "financial_ledger_entries_journal_id_fkey"
    FOREIGN KEY ("journal_id")
    REFERENCES "financial_ledger_journals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gold_ledger_entries"
    ADD CONSTRAINT "gold_ledger_entries_journal_id_fkey"
    FOREIGN KEY ("journal_id")
    REFERENCES "gold_ledger_journals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
