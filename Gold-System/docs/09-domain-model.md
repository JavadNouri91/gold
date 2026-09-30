# 09 — Domain Model

## Core bounded areas

### Identity & Customer
Customer, CustomerType, CustomerDocument, KYCVerification, User, Role, Permission.

### Pricing
PriceSource, GoldPriceSnapshot, PricingRule, PriceAdjustment, PricingCalculation.

### Order & Trade
Order, OrderItem, Quotation, QuotationItem, Assignment, Trade, TradeItem.

### Accounts & Credit
CustomerAccount, CreditLimit, CreditTransaction, GoldAccount, GoldLedgerEntry.

### Upstream
UpstreamProvider, Purchase, PurchaseItem, SupplierAccount.

### Money & Settlement
Payment, PaymentAllocation, Settlement, FinancialLedgerEntry.

### Platform
Notification, AuditLog, Attachment.

## Key relationships
- Customer 1:N Order
- Order 1:N OrderItem
- Order 1:N QuotationVersion
- Order 0:N Assignment
- Quotation 1:N QuotationItem
- Approved Quotation 1:1 Trade (logical conversion; implementation may preserve versioning)
- Trade 1:N PaymentAllocation
- Trade 0:N Settlement
- Customer 1:1 CustomerAccount
- CustomerAccount 1:N CreditTransaction
- CustomerAccount 1:N GoldLedgerEntry
- UpstreamProvider 1:1 SupplierAccount
- UpstreamProvider 1:N Purchase
- Purchase 1:N Financial/Gold Ledger Entries
- User 1:N AuditLog
- PriceSource 1:N PriceSnapshot
- PriceSnapshot may be referenced by PricingCalculation
