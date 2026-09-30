# Gold System — Database Architecture

## Database
PostgreSQL

## Schema
در MVP یک schema اصلی کافی است.

## دسته جداول

### Identity
- users
- roles
- permissions
- role_permissions

### Customer
- customers
- customer_documents
- kyc_verifications
- customer_accounts
- credit_transactions

### Pricing
- price_sources
- price_snapshots
- pricing_rules
- price_adjustments
- pricing_calculations

### Commerce
- orders
- order_items
- quotations
- quotation_items
- assignments
- trades
- trade_items

### Finance
- payments
- payment_allocations
- settlements
- financial_ledger_entries
- gold_ledger_entries

### Upstream
- upstream_providers
- supplier_accounts
- purchases
- purchase_items

### Platform
- notifications
- audit_logs
- attachments

## مهم‌ترین Indexها
- customer_number
- order_number
- trade_number
- purchase_number
- customer_id
- status
- created_at
- captured_at
- source_reference

## Constraints
- unique business numbers
- foreign keys
- non-negative values where appropriate
- valid status transitions enforced in application/domain
- Decimal types for money/gold
