# Gold System — State Machines

## Customer

```text
PENDING
  ↓
UNDER_REVIEW
  ├── APPROVED
  └── REJECTED
```

بعد از APPROVED:
```text
ACTIVE
SUSPENDED
BLOCKED
```

## Order

```text
DRAFT
  ↓
SUBMITTED
  ↓
QUOTED
  ↓
ASSIGNED
  ↓
UNDER_REVIEW
  ├── REVISION_REQUESTED → QUOTED
  ├── REJECTED
  └── APPROVED
             ↓
        TRADE_CREATED
             ↓
          SETTLING
             ↓
         COMPLETED
```

## Quotation

```text
GENERATED
  ├── ACTIVE
  ├── EXPIRED       ← triggered ONLY by Order cancellation (NOT time-based)
  ├── REVISED       ← triggered by revision request; new version supersedes this one
  └── CONVERTED     ← triggered by Trade approval
```

> Decision ref: docs/21-business-decisions.md §2.3
> Quotation does NOT expire by time-based TTL.
> No background expiration job is required for Quotation in MVP.

## Trade

```text
PENDING_CONFIRMATION
      ↓
CONFIRMED
      ↓
SETTLING
      ↓
COMPLETED
```

Exceptional:
```text
REJECTED
CANCELLED
REVERSED
```

## Payment

```text
PENDING
  ↓
VALIDATED
  ↓
ALLOCATED
  ↓
COMPLETED
```

Exceptional:
```text
FAILED
REVERSED
```

## Purchase

```text
DRAFT
  ↓
CONFIRMED         ← MVP scope ends here
  ↓
SETTLING          ← DEFERRED: not operational in MVP
  ↓
SETTLED           ← DEFERRED: not operational in MVP
```

> Decision ref: docs/21-business-decisions.md §8.4
> Supplier settlement workflow is explicitly excluded from MVP.
> States SETTLING and SETTLED are scaffolded but not implemented in MVP.
