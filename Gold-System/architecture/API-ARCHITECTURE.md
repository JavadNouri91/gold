# Gold System — API Architecture

## Base
`/api/v1`

## Authentication
```text
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

## Customers
```text
GET    /customers/me
PATCH  /customers/me
POST   /customers/registration
POST   /customers/documents
GET    /customers/me/account
```

## Orders
```text
POST   /orders
GET    /orders
GET    /orders/:id
POST   /orders/:id/cancel
```

## Quotations
```text
GET /orders/:id/quotations
GET /quotations/:id
GET /quotations/:id/download
```

## Review
```text
POST /orders/:id/assign
POST /trades/:id/approve
POST /trades/:id/reject
POST /trades/:id/request-revision
```

## Pricing
```text
GET /pricing/current
POST /pricing/calculate
GET /pricing/rules
POST /pricing/rules
```

## Payments
```text
POST /payments
GET /payments/:id
POST /payments/:id/reverse
```

## Purchases
```text
POST /purchases
GET /purchases
GET /purchases/:id
```

## Reports
```text
GET /reports/orders
GET /reports/trades
GET /reports/customer-balances
GET /reports/supplier-balances
GET /reports/ledger
```

## API Rules
- DTO validation
- authorization
- pagination
- filtering
- stable error format
- OpenAPI documentation
- idempotency for sensitive commands
