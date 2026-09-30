# 21 — Business Decisions

**Document type:** Formal Business Decision Record  
**Status:** ACTIVE — Source of Truth for Implementation  
**Session date:** 2026-09-26  
**Populated by:** Business clarification Q&A session with business owner  
**Supersedes:** open-questions.md items listed in §12  

---

## IMPORTANT RULES FOR THIS DOCUMENT

- Every item in this document is a **confirmed business decision**, not an architectural guess.
- Items marked **DEFERRED** are explicitly out of MVP scope.
- Items marked **OPEN** remain unresolved and block implementation of the relevant module.
- No implementation should contradict a decision recorded here without a formal update to this document.
- When this document is updated, the change must be noted with a date and reason.

---

## 1. PRICING ENGINE

### 1.1 Pricing Parameters — All Configurable

All pricing parameters are **configurable by the Store Manager** through the Pricing Rules system.
No pricing parameter is hard-coded.

The following parameters are configurable:
- Wage (اجرت) — amount per gram, percentage, or disabled
- Profit (سود فروشنده) — percentage of a defined base
- Tax (مالیات) — percentage, configurable; do NOT assume any default percentage
- Discount (تخفیف) — percentage or fixed amount
- Rounding — method and precision, configurable in Pricing Rule

> ⚠️ **IMPLEMENTATION RULE:** The Pricing Engine must read all parameters from stored
> PricingRule and PriceAdjustment records. Default values of zero apply if a parameter
> is not configured. The system must not assume any percentage for tax, profit, or wage.

### 1.2 Pricing Pipeline — Fixed Structure

The computation pipeline is architecturally fixed in the following order.
Individual parameter values are configurable; the pipeline **order** is not.

```
Step 1:  Base Price              ← latest valid PriceSnapshot (normalized)
Step 2:  Global Adjustment       ← seller-defined +/- % or fixed on base price
Step 3:  Purity Conversion       ← if API purity differs from trade purity (DEFERRED — see §1.5)
Step 4:  Weight Calculation      ← Step 2 result × trade weight in grams
Step 5:  Customer Group Rule     ← additional +/- % per CustomerType
Step 6:  Profit                  ← % applied to (Step 5 result) — base TBD (see OPEN §13.2)
Step 7:  Tax                     ← % applied to taxable base — base TBD (see OPEN §13.3)
Step 8:  Discount                ← applied after tax — order confirmed (see §1.3)
Step 9:  Rounding                ← configurable rule applied to final amount
Step 10: Final Customer Price
```

> ⚠️ Steps 6, 7, 8 order confirmed as: Profit → Tax → Discount.
> The exact **base** for Profit and Tax remains OPEN (see §13.2, §13.3).

### 1.3 Discount Ordering — DECIDED

**Discount is applied AFTER tax is calculated.**

Discount reduces the final invoice amount; it does not reduce the taxable base.

### 1.4 Adjustment Precedence — DECIDED

When multiple adjustments and rules apply simultaneously, the precedence order is:

```
1. Global Seller Adjustment     (PriceAdjustment — applies to all customers)
2. Customer Group Rule          (PricingRule — per CustomerType: Household / Partner / VIP)
3. Additional Discounts         (order-level or customer-specific discounts)
```

Lower-precedence rules are applied on top of the result of higher-precedence rules (additive/cumulative, not overriding).

### 1.5 Price API Unit, Reference Purity, Purity Conversion — OPEN / DEFERRED

> **Status: OPEN — Blocks Pricing Engine implementation**
>
> Q1.1 (API unit), Q1.2 (reference purity), Q1.3 (purity conversion formula) are
> **not yet known** because the external price provider has not been selected.
>
> **Architectural decision to unblock development:**
> - The Pricing Engine MUST use an abstract `PriceNormalizer` interface.
> - The normalizer converts raw API value to a canonical internal unit
>   (recommended: Rial per gram of reference purity).
> - The canonical unit is set in system configuration at deployment time.
> - The concrete normalizer implementation is provided per PriceSource adapter.
> - Development and testing proceed with a mock normalizer.
>
> **Required before production:** API provider must be selected and canonical unit defined.

### 1.6 Wage — DECIDED (Configurable, Disabled by Default for Molten Gold MVP)

Wage (اجرت) is a **configurable** parameter in the Pricing Engine.  
For molten gold (طلای آب‌شده) sales in MVP, wage is **not applicable by default**.  
The Pricing Engine must support it as a pipeline step that defaults to zero unless configured.  
No separate `Wage Income` ledger account is required in MVP.

### 1.7 Rounding — DECIDED (Configurable)

Rounding method and precision are **configurable per PricingRule**.  
Rounding applies to the **final total** after all pipeline steps.  
The specific rounding method (up, nearest, down) and precision (nearest 1,000 Toman, etc.)
must be set by the Store Manager in PricingRule configuration before the system goes live.

---

## 2. PRICE LOCK & QUOTATION

### 2.1 Price Lock Point — DECIDED

**The gold price is locked at the moment the customer submits the Order.**

- The customer observes the live price and accepts it by submitting the Order.
- At Order submission, a PricingCalculation is immediately created and all inputs are snapshotted.
- This snapshot is the **binding price** for the Order, Quotation, and eventual Trade.
- The Reviewer's subsequent approval confirms the Trade; it does **not** recalculate or change the locked price.

### 2.2 Price Change After Lock — DECIDED

**If the market price changes after Order submission, the locked price stands regardless.**

- No re-quotation is triggered by market price movement.
- No customer re-confirmation is required after price changes.
- The Reviewer sees the locked price at the time of the Order and must decide based on it.

### 2.3 Quotation Validity — DECIDED

**Quotation validity is NOT time-based.**

A Quotation remains valid until one of the following events terminates it:

| Event | Resulting Quotation State |
|---|---|
| Trade approved | `CONVERTED` |
| Trade rejected | `REJECTED` (linked to Order state) |
| Order cancelled by customer or staff | `EXPIRED` |
| Revision requested → new version generated | `REVISED` |

> **Impact on STATE-MACHINES.md:**  
> The `EXPIRED` Quotation state applies **only when the associated Order is cancelled**.  
> It is NOT triggered by a time-based TTL.  
> No background time-expiration job is required for Quotation in MVP.

---

## 3. CREDIT SYSTEM

### 3.1 Rial Credit (اعتبار ریالی) — DECIDED

**Type: Prepaid Balance**

- The customer deposits Rial (Toman) in advance with the seller.
- The deposit is recorded as `Customer Prepaid/Deposit` in the Financial Ledger.
- This prepaid balance is the customer's available spending capacity.
- Credit limit for Rial = the prepaid balance amount.

### 3.2 Gold Credit (اعتبار طلایی) — DECIDED (Critical Clarification)

**Gold Credit is a Rial-denominated credit limit, NOT a gold inventory balance.**

> This is a fundamental domain clarification that affects entity design.

The seller assigns a **Rial-denominated Gold Credit limit** to the customer.
The customer's **gold trading capacity** is dynamically calculated at the time of each Order:

```
Available Gold Capacity (grams) = Gold Credit Limit (Rial) / Current Applicable Gold Price (Rial/gram)
```

**Example:**
```
Gold Credit Limit   = 1,000,000,000 Toman
Current Price       = 10,000,000 Toman/gram
Available Capacity  = 100 grams
```

**Implementation implications:**
- `CustomerAccount.credit_limit_gold` is stored in **Rial (Toman)**, NOT in grams.
- `GoldLedgerEntry` records actual gold weight movements (upstream purchases, deliveries).
- Customer gold capacity is a **computed value** derived from Gold Credit Limit ÷ current price.
- Customer does NOT have a GoldLedgerEntry balance in the traditional sense.
- Gold Credit usage is tracked via the Financial Ledger (Rial reservation against Gold Credit Limit).

### 3.3 Credit Consumption Point — DECIDED

**Credit is reserved at Order submission, before manual review.**

Full lifecycle:

| Event | Credit Action |
|---|---|
| Customer submits Order | Required Rial credit is **immediately reserved/blocked** |
| Order is under review | Credit remains reserved/blocked |
| Trade is **approved** | Reserved credit becomes **consumed** (moved from reserved to consumed) |
| Trade is **rejected** | Reserved credit is **automatically and immediately released** |
| Order **cancelled** by customer | Reserved credit is **automatically and immediately released** |
| Order **cancelled** by authorized staff | Reserved credit is **automatically and immediately released** |

**Implementation requirements:**
- `CustomerAccount` must track: `total_credit`, `reserved_credit`, `consumed_credit`, `available_credit`.
- `available_credit = total_credit - reserved_credit - consumed_credit`
- Reservation and release must be atomic database operations.
- Idempotency must be enforced on reservation operations.

### 3.4 Credit Limit Enforcement — DECIDED

**Hard Block — no override permitted.**

- If an Order's required credit exceeds `available_credit`, the system **rejects the Order immediately**.
- The Order is not submitted for manual review.
- No manager override is possible at this stage.
- The customer must reduce the order quantity or await a credit top-up.

### 3.5 Credit on Rejection/Cancellation — DECIDED

**Released immediately and automatically — no manual step required.**

This applies to all termination paths:
- Customer cancellation
- Staff (Operator/Manager) cancellation
- Order rejection by Reviewer
- Any other rejection path

---

## 4. CUSTOMER CANCELLATION

### 4.1 Customer-Initiated Cancellation — DECIDED (Configurable Behavior)

The system must support a **configurable setting** controlling customer cancellation:

| Setting | Behavior |
|---|---|
| **Enabled** (default) | Customer may cancel their Order at any time **before Trade confirmation** |
| **Disabled** | Customer may not cancel after Order submission; cancellation requires Operator/Manager action |

**Implementation:**
- Store-level configuration flag: `allow_customer_cancellation` (boolean)
- Configurable by Store Manager
- Applied at Order submission and cancellation request time
- Customer is informed at submission whether cancellation is available

### 4.2 Post-Confirmation Cancellation / Reversal — DECIDED

After a Trade is confirmed (status: `CONFIRMED` or later):

- Cancellation/reversal is permitted **only in exceptional circumstances**.
- Requires **Manager or Seller authorization**.
- Requires a **documented reason** (mandatory text field).
- All related effects must be systematically reversed:
  - Financial Ledger reversal entry
  - Gold Ledger reversal entry (if applicable)
  - Credit reservation/consumption reversal
  - Payment reversal (if payment received — requires separate Manager approval)
  - Settlement record updated
- All reversal actions must generate **AuditLog entries**.
- Trade status transitions to `REVERSED`.
- No physical deletion of any record.

---

## 5. TRADE APPROVAL

### 5.1 Approver Role — DECIDED

**Any system user holding the `trade.approve` permission may approve a Trade.**

This permission may be assigned to roles including: Seller, Store Manager, or a designated Reviewer.
The specific role configuration is set by the Store Manager via the permission system.

### 5.2 Dual Approval for Large Trades — PARTIALLY DECIDED

**Dual approval IS required for trades above a defined threshold.**

| Aspect | Status |
|---|---|
| Dual approval required? | **YES** |
| Threshold amount (Toman) | **OPEN — not yet defined (see §13.4)** |
| Second approver role | **OPEN — not yet defined (see §13.4)** |

**Implementation note:** The dual-approval workflow must be designed and built.
The threshold amount and second approver role will be provided before production configuration.

### 5.3 Approval Reversal — DECIDED

After a Trade is approved and confirmed, reversal is permitted under these conditions:
- Exceptional circumstances only
- Manager approval required
- Documented reason required
- Full accounting reversal required (see §4.2)

---

## 6. CHART OF ACCOUNTS

### 6.1 Required Financial Accounts

The Financial Ledger must support the following conceptual accounts:

| # | Account Name | Type | Notes |
|---|---|---|---|
| FA-01 | Customer Receivable (مطالبات مشتری) | Asset | Amount owed by customer to store |
| FA-02 | Customer Prepaid / Deposit (پیش‌دریافت مشتری) | Liability | Customer's prepaid Rial balance |
| FA-03 | Supplier Payable (بدهی به بالادستی) | Liability | Amount store owes to upstream supplier |
| FA-04 | Cash (صندوق) | Asset | Physical cash |
| FA-05 | Bank (بانک) | Asset | Bank account balance |
| FA-06 | Sales Revenue (درآمد فروش) | Revenue | Revenue from gold sales |
| FA-07 | Sales Profit (سود فروش) | Revenue | Profit component of sales |
| FA-08 | Purchase Cost (بهای خرید) | Expense | Cost of upstream gold purchases |
| FA-09 | Tax Payable (مالیات پرداختنی) | Liability | Tax collected and owed to tax authority |
| FA-10 | Discount Expense (تخفیف اعطایی) | Expense / Contra-Revenue | Discounts given to customers |
| FA-11 | Price Adjustments (تعدیلات قیمت) | Contra-Revenue / Expense | Seller price adjustments |
| FA-12 | Customer Settlement (تسویه مشتری) | Clearing | Settlement clearing account |
| FA-13 | Supplier Settlement (تسویه بالادستی) | Clearing | DEFERRED — not in MVP |
| FA-14 | Reversal / Adjustment (برگشت / تعدیل) | Clearing | Reversal and correction entries |
| FA-15 | Operating Expenses (هزینه‌های عمومی) | Expense | General operating costs |

**Not required in MVP:**
- Wage Income (درآمد اجرت) — wage not applicable to molten gold at this stage

### 6.2 Gold Ledger Accounts

The Gold Ledger tracks actual gold weight movements separately from the Financial Ledger:

| # | Account Name | Notes |
|---|---|---|
| GA-01 | Store Gold Position (موجودی طلای فروشگاه) | Gold purchased from upstream; store's gold holding |
| GA-02 | Gold Obligation to Customer (تعهد طلایی به مشتری) | Gold committed to customer via confirmed Trade |
| GA-03 | Gold Reversal / Adjustment | Reversal entries for gold ledger corrections |

> **Note:** Customer Gold Credit (§3.2) is stored in Rial on `CustomerAccount`, NOT as a GoldLedgerEntry.
> GoldLedgerEntry records physical/contractual gold movements only (upstream purchases, Trade deliveries).

### 6.3 Ledger Integrity Rules (Confirmed)

- Every ledger entry must reference a source: `source_type` + `source_id`
- No ledger entry may be physically deleted
- Corrections must use reversal entries
- Balance is always derived from sum of entries; never stored as a mutable field

---

## 7. KYC DOCUMENTS

### 7.1 Document Types — DECIDED

**All document requirements are configurable.** Individual documents can be marked as required or optional through system configuration.

**Default document set:**

| Document | Required by Default | Notes |
|---|---|---|
| National ID Card — front (کارت ملی — رو) | YES | All customers |
| National ID Card — back (کارت ملی — پشت) | YES | All customers |
| Birth Certificate (شناسنامه) | YES | All customers |
| Proof of Address / Utility Bill (قبض / گواهی سکونت) | YES | All customers |
| Selfie with National ID (سلفی با مدرک) | YES | All customers |
| Business Registration Certificate (گواهی ثبت شرکت/کسب) | YES | همکار (Partner) customers only |

**Implementation requirement:** Document type list must be stored in configuration, not hard-coded. Store Manager can add, remove, or change required/optional status.

### 7.2 Document Retention — DECIDED

**7 years from account closure or rejection date.**

Subject to final legal/compliance confirmation. System must support configurable retention period per document type.

### 7.3 Document Access — DECIDED

The following roles may view KYC documents:

| Role | Access |
|---|---|
| KYC Reviewer | YES |
| Store Manager | YES |
| Accountant | YES |
| All others | NO |

**Mandatory:** Every document view and download must generate an AuditLog entry with actor, document reference, and timestamp.

---

## 8. SETTLEMENT

### 8.1 Trade Settlement Completion — DECIDED

**A Trade is considered fully settled when 100% of the Trade total has been paid.**

No partial settlement completion is permitted.

### 8.2 Installment Payments — DECIDED

**Not supported. Full payment is required in a single transaction.**

The customer must have sufficient available credit before placing the Order.
No post-Trade-confirmation credit period is granted.
No installment plan or deferred payment mechanism is in scope.

### 8.3 Payment Deadline — DECIDED

**No automatic payment deadline after Trade confirmation.**

Because the customer's credit is reserved/consumed at Order time (§3.3), and credit availability is validated before Order submission (§3.4), no separate payment clock is required. Payment records are managed manually by the Accountant.

### 8.4 Supplier Settlement — DEFERRED (Not in MVP)

Upstream supplier settlement (including bank transfers, cash, physical gold, supplier credit accounts, payment terms) is **explicitly excluded from MVP**.

**MVP scope for supplier purchases:** Recording of purchase details only (DRAFT → CONFIRMED).
Settlement states (SETTLING → SETTLED) are scaffolded but not operational in MVP.

---

## 9. PAYMENT METHODS

### 9.1 Supported Payment Methods (MVP) — DECIDED

| Method | MVP Support | Notes |
|---|---|---|
| Bank Transfer (حواله بانکی) | YES | Customer provides bank reference/receipt document |
| Card-to-Card (کارت به کارت) | YES | Customer provides transfer confirmation document |
| Cash (نقد) | YES | Staff records receipt; physical receipt attached |
| Online Payment Gateway (درگاه آنلاین) | NO — Future | Architecture must accommodate future gateway adapter |

**Mandatory:** All payment records must include supporting documents (receipt, transfer reference, etc.).

> **Implementation note:** Payment method field is an enum. Documents are attached via the
> Attachment entity pointing to Object Storage.

---

## 10. NOTIFICATIONS

### 10.1 Notification Provider — DECIDED (Multi-Provider Architecture Required)

**Two providers are in consideration: SMS.ir and Melipayamak.**  
The final provider selection is TBD.

**Architecture requirement:** The system must support **multiple notification providers** simultaneously or switchable via configuration. Use the Adapter pattern; no provider-specific code in domain or application layers.

**Channels required in MVP:**
- SMS
- In-app notifications

**Future:** Email, WhatsApp, Push — must be architecturally supportable without core changes.

---

## 11. AUTHENTICATION & SECURITY

### 11.1 MFA — DECIDED

**OTP-based two-factor authentication is required for ALL users.**

This includes:
- All customer logins
- All internal staff logins (Operator, Reviewer, Accountant, Manager, Admin)

OTP is delivered via SMS (provider per §10.1).

> **Implementation:** OTP verification required at login for all user types.
> Session token issued only after successful OTP verification.

### 11.2 Upstream Supplier Integration — DECIDED (Manual in MVP)

All upstream purchase records are entered manually by authorized staff in MVP.
Upstream provider API integration is a future phase.
Architecture must accommodate future `UpstreamProviderAdapter` without breaking changes.

---

## 12. RESOLVED OPEN QUESTIONS

The following items from `open-questions.md` are now resolved by this document:

| # | Question | Resolution | Section |
|---|---|---|---|
| 4 | اجرت چگونه محاسبه می‌شود؟ | Configurable; disabled by default for molten gold MVP | §1.6 |
| 8 | قیمت در زمان Order lock می‌شود یا Approval؟ | At Order submission | §2.1 |
| 9 | مدت اعتبار Quotation چقدر است؟ | No time-based expiry; valid until trade outcome or cancellation | §2.3 |
| 10 | در صورت تغییر قیمت، مشتری باید تأیید مجدد کند؟ | No; locked price stands regardless | §2.2 |
| 11 | اعتبار ریالی دقیقاً چه معنایی دارد؟ | Prepaid Rial balance deposited by customer | §3.1 |
| 12 | اعتبار طلایی چه معنایی دارد؟ | Rial-denominated limit; capacity dynamically calculated from current price | §3.2 |
| 14 | مصرف اعتبار هنگام Order است یا Trade؟ | Reserved at Order; consumed at Trade approval | §3.3 |
| 15 | در Reject چه اتفاقی برای رزرو اعتبار می‌افتد؟ | Released immediately and automatically | §3.5 |
| 16 | چه نقشی مجاز به Approval است؟ | Any user with `trade.approve` permission | §5.1 |
| 17 | آیا دو مرحله Approval لازم است؟ | Yes; threshold and second approver role OPEN | §5.2 |
| 18 | آیا Approval قابل برگشت است؟ | Yes; with Manager approval, documented reason, and full reversal | §5.3 |
| 19 | شرایط Cancellation چیست؟ | Configurable customer cancellation; post-confirmation requires Manager + reason | §4 |
| 20 | خرید از بالادستی چگونه تسویه می‌شود؟ | Deferred — not in MVP | §8.4 |
| 23 | Chart of Accounts چقدر جزئی است؟ | Defined in §6 | §6 |
| 26 | مدارک الزامی KYC چیست؟ | Defined in §7.1; fully configurable | §7.1 |
| 28 | چه کسی مجاز به دیدن مدارک است؟ | KYC Reviewer + Store Manager + Accountant | §7.3 |
| 29 | Retention مدارک چقدر است؟ | 7 years | §7.2 |
| 31 | Notification provider چیست؟ | SMS.ir or Melipayamak; multi-provider required | §10.1 |
| 32 | آیا Upstream API در MVP وجود دارد؟ | No; manual entry only | §11.2 |

---

## 13. REMAINING OPEN ITEMS

The following items are still **unresolved** and block specific implementation areas.

### 13.1 Price API Unit, Reference Purity, Purity Conversion — BLOCKS Pricing Engine Production

> **Status: OPEN**  
> Depends on external price provider selection.  
> **Unblocked for development via mock normalizer** (see §1.5).  
> Must be resolved before production deployment.

- Q1.1: What unit does the price API return? (e.g., Rial per gram of 999 gold)
- Q1.2: What is the reference purity of molten gold sold? (e.g., 750, 995, 999)
- Q1.3: Is a purity conversion formula applied?

### 13.2 Profit Calculation Base — BLOCKS Final Pricing Engine Implementation

> **Status: OPEN**  
> Q1.5: Is profit percentage applied to:
> (a) Base Price only?
> (b) Base Price + any adjustments?
> (c) Total after weight calculation?
> (d) Some other defined base?

### 13.3 Tax Calculation Base and Rate — BLOCKS Final Pricing Engine and Tax Ledger Posting

> **Status: OPEN**  
> Q1.6: What percentage does tax apply at? (Do not assume 10%)  
> Q1.6: What is the taxable base? (total sale? only profit? only certain components?)  
> This also affects which accounts are posted to in the Financial Ledger (FA-09).

### 13.4 Dual Approval Threshold and Second Approver Role — BLOCKS Trade Approval Workflow

> **Status: OPEN**  
> Q6.2: Above what Rial/Toman amount does a Trade require dual approval?  
> Q6.2: What role must the second approver hold?

### 13.5 Expense Categories — BLOCKS Operating Expense Tracking

> **Status: OPEN**  
> Account FA-15 (Operating Expenses) is confirmed as required.  
> Specific expense categories or sub-accounts have not been defined.  
> Must be resolved before the expense recording workflow is built.

### 13.6 Notification Provider Final Selection — BLOCKS Notification Adapter Implementation

> **Status: OPEN (non-blocking for MVP core)**  
> SMS.ir or Melipayamak. Adapter architecture is unaffected.  
> Can be resolved at integration phase.

### 13.7 Online Payment Gateway — BLOCKS Future Gateway Integration

> **Status: DEFERRED — not in MVP**  
> Gateway provider not selected; architecture must support future addition.

---

## 14. CONFLICTS AND IMPACTS ON EXISTING DOCUMENTATION

### Conflict / Clarification 1 — Quotation EXPIRED State (Resolved)

**Document:** `architecture/STATE-MACHINES.md` — Quotation state machine  
**Issue:** STATE-MACHINES.md lists `EXPIRED` as a Quotation state, which could imply time-based expiry.  
**Resolution:** `EXPIRED` applies **only when the associated Order is cancelled**. It is NOT time-driven.  
**Action required:** `STATE-MACHINES.md` must be updated to add a note clarifying the EXPIRED trigger.

### Conflict / Clarification 2 — Gold Credit Entity Design (Critical)

**Document:** `docs/10-entities.md` — `CustomerAccount.credit_limit_gold`  
**Issue:** Field name implies gold-weight denomination. Business decision confirms it is Rial-denominated.  
**Resolution:** `credit_limit_gold` stores a **Rial (Toman) amount**, not a gram value.  
Rename recommendation: `credit_limit_gold_rial` for clarity.  
**Action required:** `docs/10-entities.md` must be updated with this clarification before database schema is written.

### Conflict / Clarification 3 — GoldLedgerEntry Scope

**Document:** `docs/09-domain-model.md` — `CustomerAccount 1:N GoldLedgerEntry`  
**Issue:** Implies customers have direct GoldLedgerEntries. Business clarification shows Gold Credit is Rial-based; customers do not have gold-weight ledger entries in the normal flow.  
**Resolution:** GoldLedgerEntries belong to store-level gold accounts (Store Gold Position, Gold Obligation). Customer gold capacity is computed, not stored as ledger entries.  
**Action required:** `docs/09-domain-model.md` must be updated to reflect corrected relationship.

### Conflict / Clarification 4 — Purchase State Machine in MVP

**Document:** `architecture/STATE-MACHINES.md` — Purchase state machine includes SETTLING / SETTLED  
**Issue:** Supplier settlement is deferred from MVP (§8.4).  
**Resolution:** Purchase state machine in MVP supports only DRAFT → CONFIRMED. SETTLING and SETTLED states are scaffolded but not operationally implemented in MVP.  
**Action required:** `architecture/STATE-MACHINES.md` must note MVP scope limitation on Purchase states.

### Clarification 5 — Wage Income Ledger Account

**Document:** `docs/14-accounting.md` — conceptual accounts  
**Issue:** Wage Income account was listed as a potential account.  
**Resolution:** Wage Income (درآمد اجرت) is **not required** for molten gold MVP. Wage, if configured, flows into Sales Revenue.  
**Action required:** `docs/14-accounting.md` should note this exclusion.

---

## 15. DOCUMENT CHANGE LOG

| Date | Change | Author |
|---|---|---|
| 2026-09-26 | Initial creation from business Q&A session | Lead Architect |

---

*End of document. All remaining OPEN items in §13 must be resolved and this document updated before the affected modules enter implementation.*
