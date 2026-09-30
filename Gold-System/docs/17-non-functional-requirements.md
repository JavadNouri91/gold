# 17 — Non-Functional Requirements

## Security
- secure authentication
- RBAC
- backend authorization
- encrypted transport
- secure file storage
- secrets outside source code
- KYC access restriction
- audit trail

## Financial correctness
- Decimal arithmetic
- idempotent financial posting
- immutable ledger history
- controlled reversal
- transaction boundaries

## Availability
- graceful price API failure
- last-known-good policy
- health checks
- observability

## Performance
- responsive customer pricing
- indexed queries
- pagination
- caching only where safe
- avoid repeated external API calls unnecessarily

## Reliability
- retries for external APIs
- idempotency keys for important commands
- background jobs where appropriate
- consistent state transitions

## Privacy
- minimum necessary PII
- secure documents
- access logging
- retention policy to be finalized

## Maintainability
- modular architecture
- domain/application/infrastructure separation
- automated tests
- clear API contracts
- documentation

## UX
- mobile-friendly customer portal
- Persian RTL support
- clear monetary/gold units
- status visibility
- downloadable quotation
