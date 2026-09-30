# Cursor Implementation Plan

## هدف
این فایل راهنمای اجرای معماری توسط Cursor است.

## مرحله 0 — Read Only Analysis

Prompt:

```text
کل repository و docs/ و architecture/ را بخوان.
فعلاً هیچ کدی ایجاد یا تغییر نده.
یک گزارش شامل:
1. modules
2. entities
3. dependencies
4. state machines
5. risks
6. ambiguities
تهیه کن.
هیچ Business Rule جدیدی اختراع نکن.
```

## مرحله 1 — Project Bootstrap

Cursor:
- monorepo یا ساختار apps را ایجاد کند.
- Next.js را ایجاد کند.
- NestJS را ایجاد کند.
- TypeScript configuration
- ESLint
- Prettier
- Docker
- PostgreSQL
- Prisma

## مرحله 2 — Foundation

- config
- logging
- exception handling
- auth
- users
- roles
- permissions
- audit foundation

## مرحله 3 — Customer

- customer
- registration
- documents
- KYC
- customer type
- customer account

## مرحله 4 — Pricing

- price provider interface
- API adapter
- price snapshot
- pricing rules
- pricing engine
- calculation snapshot

## مرحله 5 — Commerce

- order
- order items
- quotation
- quotation document
- assignment
- review

## مرحله 6 — Trade

- approval
- trade creation
- state machine
- transaction posting

## مرحله 7 — Ledger

- financial ledger
- gold ledger
- credit transactions
- invariants
- reconciliation

## مرحله 8 — Payment/Settlement

- payment
- allocation
- settlement
- reversal

## مرحله 9 — Purchase

- suppliers
- supplier accounts
- purchase
- settlement

## مرحله 10 — UI

اول Customer Portal، سپس Internal Dashboard.

## مرحله 11 — Testing

برای هر Vertical Slice:
- unit
- integration
- E2E

## مرحله 12 — Review

قبل از هر release:

```text
Compare implementation with:
docs/
architecture/
acceptance criteria
```

## Cursor Rule

اگر تصمیمی روی:
- قیمت
- اعتبار
- طلا
- معامله
- حسابداری
- تسویه
اثر می‌گذارد، Cursor نباید خودش Business Rule اختراع کند.
