# Customer-Type Fees and Transparent BUY/SELL Breakdowns

**Status:** Implementation plan (source of design)  
**Date:** 2026-10-14  
**Related:** `docs/21-business-decisions.md` §1 (pricing), §3 (credit), §6 (ledger)

---

## 1. Current architecture and relevant files

### Pricing pipeline

Gold price is computed by `PricingEngineService` (`apps/api/src/modules/pricing/application/pricing-engine.service.ts`). BUY and SELL share the same formula; `side` is stored on `OrderItem.metadata` and only changes reservation behavior (`orders.service.ts`).

Exact composition of `PricingCalculation.finalPrice`:

```
step4 = unitPricePerGram × weight          // portal "مبلغ طلا"
step5 = step4 ± group % (PricingRule by CustomerType)
wage  = NONE | FIXED (whole calc) | PERCENTAGE of step5
subtotal = step5 + wage
priceBeforeRounding = subtotal − discount
finalPrice = round(priceBeforeRounding)
```

| Component | In `finalPrice`? |
|-----------|------------------|
| Gold after weight (step 4) | Yes |
| Customer-type group adj (step 5) | Yes |
| Wage (اجرت) | **Yes — added** |
| Discount, rounding | Yes |
| Profit, tax | **No** (always null) |
| Transaction fee | **Did not exist** (this feature) |

### Key files

| Area | Path |
|------|------|
| Pricing engine | `apps/api/src/modules/pricing/application/pricing-engine.service.ts` |
| Pricing rules | `apps/api/src/modules/pricing/domain/entities/pricing-rule.entity.ts` |
| Orders / reservation | `apps/api/src/modules/orders/application/orders.service.ts` |
| Credit | `apps/api/src/modules/customer-accounts/infrastructure/repositories/customer-account.repository.ts` |
| Quotations | `apps/api/src/modules/quotations/application/quotations.service.ts` |
| Trades | `apps/api/src/modules/trades/application/trades.service.ts` |
| Trade ledger | `apps/api/src/modules/financial-ledger/application/trade-ledger-posting.service.ts` |
| Portal BUY/SELL UI | `apps/web/src/components/portal/buy-gold/buy-gold-page.tsx` |
| Pricing view mapper | `apps/web/src/lib/pricing-view.ts` |
| Schema | `prisma/schema.prisma` |

### Customer types

`HOUSEHOLD` / `PARTNER` / `VIP` (app). Pricing rules match type then fall back to `customerType = null`. No per-customer pricing override table.

---

## 2. Existing pricing and money-movement behavior

```
CREATE (DRAFT) → PricingCalculation.finalPrice → Order.totalAmountRial
SUBMIT BUY    → reserve rial = totalAmountRial
SUBMIT SELL   → check sellable grams; rial reserve = 0
QUOTATION     → copies locked calc snapshot
TRADE CONFIRM → consume reserved (if > 0); post FA-02/FA-06 + GA-02 IN
SETTLEMENT    → allocations ≥ trade.totalAmountRial
```

- Price locked at **order create** (implementation). Docs §2.1 say “at submit”; fee work does not change lock point.
- SELL ledger was BUY-shaped (prepaid debit / sales credit / gold IN) for every trade — corrected as part of this feature.
- Cancel/reject releases `order.reservedAmountRial` if > 0.

---

## 3. Definitions

| Term | Definition |
|------|------------|
| **Gross gold commercial (`goldCommercialRial`)** | Existing `PricingCalculation.finalPrice` (includes wage, discount, rounding). Fees are **not** inside the pricing engine. |
| **Wage (اجرت)** | Pricing-rule charge already inside `finalPrice`. Displayed as its own line under gold. **Not** a SELL deduction. Side-agnostic. |
| **Buy / sell fee (کارمزد)** | New, independent, per `CustomerType` + side. Never the same row as wage. |
| **BUY payable** | `goldCommercial + sum(buyFees)` |
| **SELL gross** | `goldCommercial` |
| **SELL net receivable** | `goldCommercial − sum(sellFees)` |
| **Other charges** | Profit/tax remain blocked. Snapshot is generic (`TRANSACTION_FEE` in MVP). |

---

## 4. Calculation formulas

- Math: `decimal.js` only. Fee money: `toDecimalPlaces(2, ROUND_HALF_UP)`.
- Do **not** re-apply `PricingRule` rounding to fees.

**Percentage:** `amount = baseAmount × feeValue / 100`, then 2-dp half-up.

**Explicit bases (required when mode = PERCENTAGE):**

- `GOLD_VALUE_STEP4`
- `AFTER_GROUP_RULE_STEP5`
- `GOLD_COMMERCIAL_TOTAL` (default = `finalPrice`)

**BUY:** `payable = goldCommercial + sum(buyFees)`. Reject if fee < 0 or payable < 0.  
**SELL:** `receivable = goldCommercial − sum(sellFees)`. Reject if receivable < 0.  
Disabled / NONE → amount 0, omit from UI.

---

## 5. Reservation and settlement flows

**Recommendation: Deduct SELL fees from proceeds; do not reserve extra rials on SELL.**

| Side | Rial reserve | Gold | Consume at trade | Settlement target |
|------|--------------|------|------------------|-------------------|
| BUY | `payable` | none | consume reserved payable | `trade.totalAmountRial` = payable |
| SELL | `0` | booked grams | skip rial consume | `trade.totalAmountRial` = receivable |

**Invariant:** BUY `reservedAmountRial` = snapshot payable = consume amount = settlement total. Fees appear in snapshot and ledger once.

**Ledger (no double-count):**

- BUY: `DR FA-02 payable`; `CR FA-06 goldCommercial`; `CR FA-11 feeIncome`
- SELL: branch SELL postings (store purchase / customer payable + fee income), not BUY-shaped journals

---

## 6. Database and API changes

### Tables

**`CustomerTypeFeePolicy`**

- `customerType` nullable (null = default fallback)
- `side` BUY | SELL | PICKUP
- `code` (`TRANSACTION_FEE` for BUY/SELL, `PICKUP_CONVERSION_FEE` for PICKUP)
- `labelFa`, `mode` NONE|FIXED|PERCENTAGE, `value`, `calculationBase` nullable
- `enabled`, `priority`, `activeFrom`/`activeTo`, `status`

**`TransactionChargeSnapshot`**

- Linked to Order (and referenced from Quotation/Trade via order)
- Line items: `code`, `labelFa`, `side`, `mode`, `rateValue`, `calculationBase`, `baseAmount`, `amount`

**Order / Quotation / Trade**

- `goldAmountRial` = `finalPrice`
- `feeAmountRial` = sum of fees (positive; BUY add / SELL deduct)
- `totalAmountRial` = customer-facing net (payable or receivable)

### API

- Staff CRUD `/pricing/fee-policies` (`pricing.fees.manage`)
- `POST /pricing/calculate` accepts `side`; portal ignores client `customerType` (uses DB type)
- Response: `charges[]`, `goldCommercialRial`, `feeTotalRial`, `payableRial` / `receivableRial`
- `TransactionFeeService` — engine stays unaware of fees

---

## 7. Admin and customer UI

- Admin: `/dashboard/settings/fees` — matrix customer type × BUY/SELL
- Portal BUY/SELL: transparent line items; TotalCard uses payable/receivable
- Rename wage label to اجرت; کارمزد reserved for transaction fees
- Quotation documents and staff views print the same snapshot

---

## 8. Test cases and acceptance criteria

- Fee 0 / disabled ≡ today’s totals and BUY reserve
- Different fees per type and side; % bases; FIXED; validation
- BUY reserve = payable; SELL rial reserve = 0; receivable < 0 rejected
- Client cannot spoof `customerType` on portal calculate
- Historical snapshots immutable after policy change
- No double-count wage vs fee; ledger gold vs fee split
- Concurrency, idempotency, decimal half-up

**Acceptance:** preview total = order total = reserved (BUY) = consumed = settlement target = ledger (gold + fees).

---

## 9. Migration and backward compatibility

1. Additive schema + backfill `goldAmountRial = totalAmountRial`, `feeAmountRial = 0`
2. Snapshot version bump when charges present
3. No policies ⇒ zero fees ⇒ old behavior
4. Do not rewrite `finalPrice` semantics
5. Update `docs/21-business-decisions.md` with transaction-fee section (separate from §1.6 wage)

---

## 10. Risks, assumptions, and open questions

**Assumptions (approved for implementation):**

1. SELL fees deducted from proceeds; no SELL rial reserve
2. No per-customer fee override in v1
3. Default % base = `GOLD_COMMERCIAL_TOTAL`
4. Wage stays side-agnostic in the pricing engine
5. Profit/tax stay blocked; only `TRANSACTION_FEE` ships
6. SELL journals corrected as part of this work

**Risks:** buy-gold credit-short / toman-target must use payable; quotation PDF must print net + lines; FA-11 must exist in chart.

**Open (documented, not blocking MVP):** FIXED wage per-gram vs per-calc; future per-customer overrides.

---

## 11. Pickup conversion fee (کارمزد تبدیل به فیزیکی)

Converting melted (allocated) gold into a physical bar is a distinct chargeable service. The
customer already paid a trade fee on the original purchase; the conversion fee is **additional**
and appears only on the pickup pre-invoice/invoice (never on purchase/trade documents).

**Policy:** per `CustomerType` (with null default) on the new `side = PICKUP`, `code =
PICKUP_CONVERSION_FEE`. Modes `NONE` / `FIXED` / `PERCENTAGE`; for `PERCENTAGE` the only base is
`PICKUP_GOLD_VALUE` = per-gram price × weight at request time. `side`/`code` are immutable after
creation so the policy matrix stays stable.

**Money movement:**

| Stage | Action |
|-------|--------|
| `REQUESTED` (create) | compute fee → snapshot `PickupChargeSnapshot` → **reserve** from Rial wallet (`sourceType = PICKUP`) |
| cancel | **release** reservation (`status = RELEASED`) |
| `DELIVERED` | **consume** reservation (`SETTLED`) + post `FA-02 DR` / `FA-16 CR` (idempotency `PICKUP_FEE_${pickupId}`) |

**Documents:** immutable JSON `pre-invoice` (at request) and `invoice` (at delivery) under
`pickups/{pickupNumber}/{pre-invoice|invoice}.json`, generated by `PickupDocumentService` and
served via `GET /pickups/:id/pre-invoice` and `/invoice`. Generation is non-destructive: a
storage failure still creates the pickup, and the UI prints from the response payload.

**API:** `GET /pickups/fee-preview?weightGrams&priceSnapshotId` returns fee, base, per-gram
price, wallet balance, `canAfford` and `shortfall`; `POST /pickups` accepts an optional
`priceSnapshotId` to lock the previewed price (the server always recomputes and reserves).

**Data:** `PickupChargeSnapshot` (one row per request) records `code`, `labelFa`, `mode`,
`rateValue`, `calculationBase`, `baseAmountRial`, `amountRial`, `goldPricePerGramRial`,
`policyId`, `status` (`NONE | RESERVED | SETTLED | RELEASED`), `walletAvailableAfterRial`,
`reservedAt`, `settledAt`, `releasedAt`. `PhysicalGoldPickup` gains document key/mime/generated-at
columns. Legacy pickups are non-retroactive (`fee = 0`, `status = NONE`).

See `docs/21-business-decisions.md` §15.5.
