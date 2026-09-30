# 04 — Actors & Permissions

## Actors
1. Customer
2. Seller
3. Operator
4. Accountant
5. Store Manager
6. Reviewer/Approver
7. Upstream Provider
8. External Price API
9. Platform Admin (optional operational role)

## Permission groups

### Customer
- `customer.profile.read`
- `customer.order.create`
- `customer.order.read_own`
- `customer.quotation.read_own`
- `customer.quotation.download_own`
- `customer.payment.read_own`
- `customer.account.read_own`

### Seller
- `order.read`
- `quotation.read`
- `customer.read`
- `trade.review`
- `trade.comment`
- `customer.account.read`

### Operator
- `order.read`
- `order.assign`
- `quotation.read`
- `trade.review`
- `trade.revision`
- `notification.manage`

### Reviewer
- `trade.approve`
- `trade.reject`
- `trade.request_revision`

### Accountant
- `payment.create`
- `payment.read`
- `settlement.manage`
- `ledger.read`
- `financial_report.read`
- `supplier_account.manage`

### Store Manager
- all operational permissions as granted
- pricing rules
- customer group assignment
- credit management
- user management
- reports

### Platform Admin
- system configuration
- technical support
- tenant/store administration if later enabled

## اصل
Permission باید مستقل از UI باشد و Backend باید آن را enforce کند.
