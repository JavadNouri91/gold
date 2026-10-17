# 16 — Notifications & Audit

## Notifications
### Customer
- registration received
- KYC approved/rejected
- order received
- quotation generated
- review started if appropriate
- trade approved/rejected
- payment recorded
- settlement completed
- pickup requested / ready / delivered / cancelled

### Internal
- new order
- assigned order
- price feed failure
- pending review
- payment issue
- settlement issue
- new pickup request

## Notification record
- recipient
- channel
- template
- payload reference
- status
- sent_at
- provider reference
- retry count

## Audit
Sensitive operations:
- KYC decisions
- customer type changes
- credit changes
- pricing rule changes
- trade approval/rejection
- payment creation/reversal
- ledger adjustments
- permission changes
- physical gold pickup status changes

Audit fields:
- actor
- action
- entity
- timestamp
- request/correlation id
- before/after summary
- reason
