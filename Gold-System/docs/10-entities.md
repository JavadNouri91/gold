# 10 — Entities

## Store
- id
- name
- legal/business identifiers
- status
- created_at
- updated_at

## User
- id
- name
- mobile/email
- status
- role_id
- last_login_at
- timestamps

## Customer
- id
- user/account identity reference as appropriate
- customer_number
- type
- status
- verification_status
- profile fields
- timestamps

## CustomerDocument
- id
- customer_id
- document_type
- file_reference
- verification_status
- reviewed_by
- reviewed_at
- rejection_reason

## KYCVerification
- id
- customer_id
- status
- reviewer_id
- decision_reason
- timestamps

## PriceSource
- id
- name
- provider_type
- endpoint/config reference
- status

## PriceSnapshot
- id
- source_id
- symbol/market
- raw_value
- normalized_value
- currency/unit
- captured_at
- validity_status

## PricingRule
- id
- name
- customer_type nullable
- priority
- active_from
- active_to
- rule configuration
- status

## PriceAdjustment
- id
- mode: percentage/fixed
- direction: increase/decrease
- value
- applies_to
- effective_from/to

## PricingCalculation
- id
- reference_type/reference_id
- price_snapshot_id
- base_price
- adjustments
- wage
- profit
- tax
- discount
- final_price
- calculated_at
- calculation_version

## Order
- id
- order_number
- customer_id
- status
- requested_at
- currency/unit context
- pricing_snapshot_reference
- total
- expires_at

## OrderItem
- id
- order_id
- quantity/weight
- purity
- unit_price
- total
- metadata

## Quotation
- id
- order_id
- version
- status
- pricing_calculation_id
- valid_until
- generated_at
- document_reference

## Assignment
- id
- order_id/quotation_id
- assigned_to
- assigned_by
- status
- assigned_at
- completed_at

## Trade
- id
- trade_number
- order_id
- quotation_id
- customer_id
- status
- confirmed_by
- confirmed_at
- locked_terms_snapshot

## TradeItem
- id
- trade_id
- weight
- purity
- price
- total

## UpstreamProvider
- id
- name
- contact
- integration_type
- status

## Purchase
- id
- purchase_number
- provider_id
- status
- settlement_type
- total
- confirmed_at

## PurchaseItem
- id
- purchase_id
- weight
- purity
- price
- total

## CustomerAccount
- id
- customer_id
- status
- credit_limit_rial          ← Rial (Toman) prepaid balance limit; type: DECIMAL
- credit_limit_gold_rial     ← Rial (Toman) gold credit limit; capacity in grams = this ÷ current_price
                                NOT stored in grams. NOT physical gold inventory.
                                Decision ref: docs/21-business-decisions.md §3.2
- reserved_credit_rial       ← amount blocked at Order submission; released on rejection/cancellation
- consumed_credit_rial       ← amount consumed at Trade approval
- timestamps

> available_credit = credit_limit_rial - reserved_credit_rial - consumed_credit_rial
> Gold trading capacity (grams) is a computed value, not a stored field.

## CreditTransaction
- id
- customer_account_id
- type
- amount
- unit
- source_reference
- reason
- created_by
- created_at

## GoldLedgerEntry
- id
- account_id          ← references STORE gold accounts (GA-01, GA-02), NOT customer accounts
                         Customer gold capacity is Rial-based; see CustomerAccount.credit_limit_gold_rial
                         Decision ref: docs/21-business-decisions.md §3.2 and §6.2
- direction           ← IN / OUT
- quantity            ← DECIMAL; weight in grams
- purity              ← DECIMAL; e.g., 0.750 for 18K
- source_type         ← e.g., PURCHASE, TRADE, REVERSAL
- source_id
- balance_after       ← if denormalized safely
- created_at

## FinancialLedgerEntry
- id
- account_type
- account_id
- debit
- credit
- currency
- source_type
- source_id
- description
- created_at

## Payment
- id
- payer/payee reference
- method
- amount
- currency/unit
- status
- external_reference
- received_at
- created_by

## PaymentAllocation
- id
- payment_id
- target_type
- target_id
- amount

## Settlement
- id
- trade_id/purchase_id
- status
- settled_amount
- settled_unit
- settled_at

## AuditLog
- id
- actor_id
- action
- entity_type
- entity_id
- before
- after
- reason
- timestamp
- correlation_id
