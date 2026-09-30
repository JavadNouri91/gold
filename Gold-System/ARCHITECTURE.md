# Gold System — Technical Architecture

## 1. هدف

این سند معماری فنی پیشنهادی Gold System را بر اساس Scope و Domain فعلی تعریف می‌کند.

هدف:
- معماری ساده و قابل نگهداری
- مناسب برای تعداد کاربر و حجم فعلی پروژه
- قابل توسعه در آینده
- مناسب توسعه AI-assisted با Cursor
- جلوگیری از پیچیدگی غیرضروری

## 2. تصمیم معماری

### Modular Monolith

Gold System در نسخه فعلی یک Backend واحد دارد، اما Domainها به صورت Moduleهای مستقل سازمان‌دهی می‌شوند.

### چرا؟
- تعداد User بالا نیست.
- حجم تراکنش فعلی متوسط/پایین است.
- تیم توسعه کوچک است.
- عملیات مالی و طلایی نیازمند Transaction و Consistency هستند.
- Microservice در این مرحله هزینه عملیاتی و پیچیدگی اضافه ایجاد می‌کند.

## 3. Stack

### Frontend
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend
- NestJS
- TypeScript
- REST API
- OpenAPI/Swagger

### Data
- PostgreSQL
- Prisma ORM

### Infrastructure
- Docker
- Nginx یا Reverse Proxy معادل
- S3-compatible Object Storage

### Testing
- Jest
- Playwright

### Optional Later
- Redis
- BullMQ
- Sentry
- GitHub Actions

## 4. High-Level Architecture

```text
                   Internet
                      |
              Reverse Proxy / TLS
                      |
             +--------+--------+
             |                 |
       Customer Portal    Admin Dashboard
          Next.js             Next.js
             |                 |
             +--------+--------+
                      |
                 REST API
                      |
                 NestJS App
                      |
        +-------------+-------------+
        |             |             |
     Domain       Application   Infrastructure
        |             |             |
        +-------------+-------------+
                      |
              +-------+-------+
              |               |
         PostgreSQL      Object Storage
              |
        Financial/Gold
           Ledgers
```

## 5. Backend Architecture

هر Module چهار لایه اصلی دارد:

```text
module/
├── domain/
├── application/
├── infrastructure/
└── presentation/
```

### Domain
- Entities
- Value Objects
- Domain Rules
- Domain Services
- Domain Events

### Application
- Use Cases
- Commands
- Queries
- DTO orchestration
- Transaction boundary

### Infrastructure
- Prisma repositories
- External API adapters
- File storage
- Notification providers

### Presentation
- REST Controllers
- Request DTOs
- Response DTOs
- Guards

## 6. Core Modules

```text
src/modules/
├── auth
├── users
├── customers
├── kyc
├── pricing
├── orders
├── quotations
├── assignments
├── trades
├── customer-accounts
├── gold-ledger
├── financial-ledger
├── payments
├── settlements
├── suppliers
├── purchases
├── notifications
├── audit
└── reports
```

## 7. Dependency Rules

قانون اصلی:

```text
Presentation
      ↓
Application
      ↓
Domain
      ↑
Infrastructure
```

Domain نباید مستقیماً به Prisma، HTTP، NestJS Controller یا Provider خارجی وابسته باشد.

## 8. Database

PostgreSQL منبع اصلی حقیقت داده است.

اصول:
- Foreign Key
- Unique Constraint
- Check Constraint در موارد مناسب
- Index برای Queryهای پرتکرار
- Transaction برای عملیات حساس
- Decimal برای پول و طلا
- Migration versioning

## 9. Prisma

Prisma مسئول:
- schema mapping
- migrations
- repository implementation
- database queries

Prisma نباید در Domain Entityها پخش شود.

## 10. Financial Integrity

هر عملیات مالی/طلایی باید در یک Transaction مناسب انجام شود.

مثلاً:

```text
Trade Approval
    |
    +--> Create Trade
    +--> Post Financial Ledger
    +--> Post Gold Ledger
    +--> Update Settlement State
    +--> Create Audit
```

اگر عملیات اتمیک تعریف شده است، شکست هر بخش باید باعث rollback شود.

## 11. Decimal

برای موارد زیر از Float استفاده نشود:
- قیمت
- مبلغ
- وزن
- عیار
- اعتبار
- مانده Ledger

استفاده از Decimal/NUMERIC در PostgreSQL الزامی است.

## 12. Authentication

پیشنهاد:
- Access Token کوتاه‌عمر
- Refresh Token
- Password hashing با Argon2 یا bcrypt
- Role-Based Access Control
- Permission checks در Backend

## 13. Authorization

Authorization فقط در Frontend نیست.

```text
Request
  ↓
Authentication Guard
  ↓
Authorization / Permission Guard
  ↓
Controller
  ↓
Use Case
```

## 14. File Storage

مدارک KYC و فایل‌های پیش‌فاکتور در Object Storage نگهداری شوند.

Database فقط metadata/reference را نگه دارد.

فایل‌های حساس:
- private bucket
- signed URL
- access control
- audit

## 15. Price API

Price Provider از طریق Adapter به سیستم متصل شود.

```text
Pricing Application
        |
   PriceProvider
        |
External API Adapter
        |
External Provider
```

Domain نباید Provider-specific باشد.

## 16. Pricing Flow

```text
Price API
   ↓
Normalize
   ↓
Validate
   ↓
Price Snapshot
   ↓
Pricing Engine
   ↓
Pricing Calculation
   ↓
Quotation
```

## 17. Order/Trade Separation

این اصل معماری حیاتی است:

```text
Order
  ↓
Quotation
  ↓
Manual Review
  ↓
Approval
  ↓
Trade
```

Order یا Quotation به تنهایی اثر معامله قطعی ایجاد نمی‌کند.

## 18. Ledger Architecture

دو Ledger اصلی:

```text
Financial Ledger
Gold Ledger
```

هر Entry باید Source Reference داشته باشد.

مثلاً:

```text
source_type = TRADE
source_id   = TRD-00125
```

Ledger Entry حذف نمی‌شود.

اصلاح از طریق:
- Reversal
- Adjustment
انجام می‌شود.

## 19. API Architecture

REST API نسخه‌بندی شود:

```text
/api/v1/auth
/api/v1/customers
/api/v1/orders
/api/v1/quotations
/api/v1/trades
/api/v1/pricing
/api/v1/payments
/api/v1/purchases
/api/v1/reports
```

Response format باید استاندارد باشد.

## 20. Error Handling

خطاها باید طبقه‌بندی شوند:
- Validation
- Authentication
- Authorization
- Business Rule
- Not Found
- Conflict
- External Provider
- Internal Error

اطلاعات حساس نباید در Error Response قرار گیرد.

## 21. Background Jobs

در MVP تا حد امکان از synchronous processing استفاده شود.

برای کارهایی که واقعاً asynchronous هستند:
- Notification
- Price polling
- document generation
- scheduled expiration

می‌توان Redis/BullMQ را اضافه کرد.

## 22. Observability

حداقل:
- structured logs
- request id
- correlation id
- error logging

در Production در صورت نیاز:
- Sentry
- metrics
- alerts

## 23. Deployment

MVP:

```text
Docker Compose
├── frontend
├── backend
├── postgres
└── reverse-proxy
```

Object Storage می‌تواند external باشد.

در صورت رشد سیستم، deployment به orchestration پیشرفته قابل ارتقاست.

## 24. Backup

PostgreSQL:
- daily backup
- retention policy
- restore test

Backup بدون تست Restore قابل اتکا محسوب نمی‌شود.

## 25. Security

الزامات:
- HTTPS
- secure cookies/token handling
- password hashing
- rate limiting
- input validation
- file type/size validation
- secret management
- least privilege
- audit logs

## 26. Architecture Principles

1. Simplicity first.
2. Domain over framework.
3. Financial correctness over convenience.
4. Explicit state transitions.
5. Immutable history.
6. No hidden business rules.
7. Backend authorization.
8. External integrations behind adapters.
9. Tests for business-critical logic.
10. Documentation changes with domain changes.
