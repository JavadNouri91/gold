# Customer authentication enhancement

Local follow-up (2026-11-05): applied `202611050001_customer_auth` to the local
`gold_db` after diagnosing login HTTP 500 errors caused by the missing schema.
Prisma reports the database up to date; customer/staff invalid-credential checks
now return the expected HTTP 401 responses. Other deployment environments still
require their own migration step.

## Architecture and behavior

The existing NestJS auth module, Prisma `User`/`Customer` models, Argon2 passwords,
`OtpCode` repository, JWT access tokens, refresh-token sessions, session-limit policy,
audit service, and notification/SMS adapters remain the authentication system.

The Persian RTL customer page at `/portal/login` now offers registration, password
login, SMS login, and password recovery. Staff keep password plus OTP; the former
development OTP bypass is no longer used. Password characters are preserved exactly.
New passwords require 12أ¢â‚¬â€œ128 characters including a Unicode letter and number.

Registration keeps an expiring password hash and names in the existing OTP record.
Verification atomically consumes that record, uses the existing user/customer creation
helpers, assigns only `customer`, records `User.mobileVerifiedAt`, creates one zero
`CustomerAccount`, and audits registration. Customer status starts `PENDING` and
financial account status `INACTIVE`; login and dashboard access are permitted.
Balances and holdings continue to come from the existing accounts and ledgers.
Registration creates no financial or gold ledger postings.

National ID is nullable until entered once through the existing KYC screen. Existing
identity values cannot be overwritten through that endpoint. KYC approval/activation
requires identity completion. Existing header warnings are reused and link to
`/portal/profile#kyc`. The existing admin lists and KYC queues use the same records.

Existing customers may sign in with their current passwords without mandatory
recovery, including legacy national-ID defaults. Persian/Arabic digit conversion
is retained only for an existing national-ID default whose hash still matches;
customer-chosen passwords continue to require an exact match. Admin-created
customers without an explicit password receive an unguessable random password and
can establish their own password through SMS recovery. Existing hashes are never
silently changed. Explicit national-ID passwords are rejected for new customers.

## HTTP interfaces

All paths below have the `/api/v1` prefix. Existing response envelopes still apply.
All auth POST requests require `X-Auth-Request: 1`; browser requests must originate
from the exact CORS allowlist and include credentials.

| POST path                    | Input                                                  | Result                                                             |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| `/auth/register`             | firstName, lastName, mobile, password, confirmPassword | Generic initiation response                                        |
| `/auth/register/verify`      | mobile, otp                                            | Session and dashboard entry                                        |
| `/auth/customer/password`    | mobile, password                                       | Customer session                                                   |
| `/auth/customer/otp/request` | mobile                                                 | Generic initiation response; never registers                       |
| `/auth/customer/otp/verify`  | mobile, otp                                            | Customer session                                                   |
| `/auth/login`                | mobile, password                                       | Existing password-plus-OTP initiation                              |
| `/auth/otp`                  | mobile, otp                                            | Existing second-factor verification                                |
| `/auth/password/forgot`      | mobile                                                 | Generic recovery initiation                                        |
| `/auth/password/verify`      | mobile, otp                                            | Five-minute, single-use resetGrant                                 |
| `/auth/password/reset`       | mobile, resetGrant, password, confirmPassword          | Replaces password; revokes sessions and login-confirmation tickets |
| `/auth/refresh`              | empty body; refresh cookie                             | Rotates refresh secret; returns access token and current user      |
| `/auth/logout`               | empty body; refresh cookie                             | Revokes session and clears cookie                                  |
| `/customers/me/kyc/identity` | nationalId                                             | One-time, checksum-validated identity completion                   |

Existing session confirmation/list/revocation routes remain. Session responses set
an HttpOnly refresh cookie and omit the refresh token from JSON. Access tokens exist
only in JavaScript memory. Both portals remove legacy localStorage tokens and hydrate
through cookie refresh. Refresh requests are coalesced within a tab and serialized
across tabs using Web Locks where available. Old clients submitting refresh tokens
in JSON must be upgraded together with the backend.

The legacy `/customers/registration` creation route is now staff-only with
`customer.group.assign`; public clients must use `/auth/register` and verification.
This closes the old route that otherwise bypassed mobile verification.

## Security and financial boundaries

- OTPs are cryptographically generated six-digit codes, Argon2id-hashed, valid for
  120 seconds, single-use, and limited to three verification attempts. Transactional
  PostgreSQL advisory locks serialize replacement, attempts, and consumption by
  mobile and purpose. Failed attempts commit; successful side effects share the
  consumption transaction. Registration, staff MFA, customer login, recovery OTP,
  and recovery grants have separate purposes.
- Shared database counters enforce a 60-second SMS cooldown, five sends per
  mobile/account/hour and twenty per IP/hour. Password attempts are limited to ten
  per mobile and fifty per IP per fifteen minutes. Existing endpoint throttles
  additionally apply. API replicas share the durable counters.
- Initiation messages hide unknown, existing, and unavailable accounts. Invalid
  credentials use generic errors. Delivery failures invalidate challenges and retain
  generic responses; an initiation response does not guarantee SMS delivery.
- The existing SMS adapters and notification service are reused. OTP payloads are
  absent from notification records and production logs. Provider error bodies are
  redacted. Production rejects mock delivery, including database-selected mock mode.
- Refresh cookies are HttpOnly, SameSite=Strict, Secure in production, host-only,
  scoped to `/api/v1/auth`. Refresh secrets retain existing server-side expiration
  and rotation. Browser cookie retention is capped at thirty days. The frontend/API
  must be deployed on the same site for Strict cookies.
- Exact Origin validation plus the mandatory custom header protects auth mutations
  against CSRF. Bearer access tokens continue to protect other APIs.
- Account availability is checked during authentication, refresh, session creation,
  session-limit confirmation, and authenticated requests. Suspension and blocking
  remain authoritative.
- Customer order creation/submission, deposits, withdrawals, and physical pickup
  creation have backend KYC guards. Existing trading policies still apply. Read-only
  access and KYC submission remain available; existing cancellation/review/accounting
  workflows retain their service authorization. Financial error UI offers the KYC
  link; pending-review messaging does not request duplicate documents.
- Expired OTP/registration/grant records and rate counters are removed every ten
  minutes while an API instance is running. Expiration is enforced even before cleanup.

## Database migration and deployment

Migration: `prisma/migrations/202611050001_customer_auth/migration.sql`.
It adds `users.mobile_verified_at`, nullable customer national ID, an OTP payload,
purpose enum values, and shared auth rate counters. It normalizes existing mobile
numbers without changing customer IDs, hashes, KYC, balances, or transaction history.
It aborts on collisions, invalid legacy mobiles, or linked user/customer mismatches.
No account merging or automatic identity repair is performed.

1. Back up the database. Set `DATABASE_URL` and run
   `node scripts/auth-mobile-preflight.js`. Resolve any reported IDs manually.
   The read-only preflight passed against the current application database.
2. Stop API workers before `pnpm db:generate` on Windows. Client generation in this
   session encountered a locked Prisma engine DLL; do not replace it while a process
   is using it. Generated types and the existing engine were sufficient for the
   successful checks, builds, and runtime tests reported below.
3. Run `pnpm db:migrate:deploy` against the intended deployment database, then
   regenerate the client and deploy backend and frontend together. The application
   database migration was **not** applied during implementation; migration tests used
   only a disposable database/schema.
4. Ensure the seeded `customer` role and its existing permissions are present.
5. Set production `NODE_ENV`, existing JWT secrets, `CORS_ORIGIN` to exact frontend
   origins, and `NEXT_PUBLIC_API_URL` to the intended API. Serve HTTPS and keep the
   frontend and API on the same site. Do not use wildcard CORS with credentials.
6. If behind a reverse proxy, set `TRUSTED_PROXY_CIDRS` to its exact trusted networks
   and restrict direct API access. Leave it empty for direct connections. This keeps
   client-IP rate limits accurate without trusting arbitrary forwarded headers.
7. Set `SMS_PROVIDER=smsir` or `melipayamak`, with the existing provider variables
   and/or encrypted admin settings. The current application database selects SMS.ir
   and has stored key/sender settings; the environment selects mock. Production
   startup requires a non-mock environment selection even with a database override.
   Credential presence does not establish delivery. Verify decryption, sender/provider
   permissions, and receipt of a controlled real SMS before releasing registration.
8. Expect a fresh browser login after the storage migration. Monitor authentication
   failure rates, throttling, cleanup failures, SMS failures, and KYC rejections.

Do not roll back the nullable identity column while new customers still lack national
IDs. Prefer an application rollback compatible with the expanded schema, preserve
all financial data, and require fresh sessions when changing token transport.

Provider configuration reuses `SMS_API_KEY`, `SMS_SENDER_LINE`, `SMSIR_BASE_URL`,
`MELIPAYAMAK_BASE_URL`, `MELIPAYAMAK_PASSWORD`, and `SETTINGS_ENCRYPTION_KEY`.
Keep the encryption key stable to preserve existing encrypted admin credentials.
Public auth OTP policy is fixed at six digits, 120 seconds, and three attempts;
legacy OTP environment settings cannot loosen it, and `OTP_LOGIN_BYPASS` has no effect.

## Verification and limitations

- API suite: **59 suites, 798 tests passed**, including isolated PostgreSQL OTP,
  registration concurrency, rollback, replay, rate-limit, recovery and existing
  accounting regression tests. Subsequent focused tests cover final auth refinements.
- Web suite: **74 suites, 459 tests passed**, including customer forms, exact password
  handling, recovery stages, method switching, existing KYC indicator, and regressions.
- API/web TypeScript checks and production builds passed. Runtime API startup and
  HTTP smoke checks passed for CSRF, customer password login, HttpOnly refresh cookies,
  permitted profile access, refresh rotation, and logout.
- The migration passed against a disposable copy of the application schema and a
  separate legacy fixture with Persian/Arabic/international mobiles, unchanged hashes,
  IDs, balances, and journal references.
- Changed backend files pass non-fixing ESLint. Full backend lint still reports
  13,165 errors in 45 untouched files, mostly existing formatting/line-ending issues.
  Web lint passes with 17 existing warnings. No unrelated lint cleanup was attempted.
- Live SMS delivery and manual real-device visual testing have not been performed.
  RTL, responsive classes, dark styling, component tests, and production rendering
  were checked through the implementation and automated checks.

For database tests, set both `DATABASE_URL` and `AUTH_TEST_DATABASE_URL` to an isolated
database named `gold_auth_test_...`; the new integration suite refuses other database
names. Existing credit integration tests use `DATABASE_URL`, so always set it explicitly.
The disposable database used here was `gold_auth_test_20261105` on the local PostgreSQL
container; application records were not copied into it.

Primary changes are in the auth module and shared web auth client, customer creation
and nullable identity DTOs, KYC identity/header integration, financial endpoint guards,
SMS error handling, session availability checks, tests, migration, and preflight script.
No new auth system, user table, SMS provider, or UI library was introduced.

## Changed files

```text
.env.example
apps/api/src/app.module.ts
apps/api/src/common/guards/approved-kyc.guard.ts
apps/api/src/main.ts
apps/api/src/modules/auth/application/auth-security.service.ts
apps/api/src/modules/auth/application/auth.service.ts
apps/api/src/modules/auth/application/dto/customer-auth.dto.ts
apps/api/src/modules/auth/application/dto/login.dto.ts
apps/api/src/modules/auth/auth-boundaries.spec.ts
apps/api/src/modules/auth/auth.module.ts
apps/api/src/modules/auth/auth.service.spec.ts
apps/api/src/modules/auth/customer-auth.integration.spec.ts
apps/api/src/modules/auth/domain/mobile.ts
apps/api/src/modules/auth/infrastructure/repositories/otp.repository.ts
apps/api/src/modules/auth/infrastructure/strategies/jwt.strategy.ts
apps/api/src/modules/auth/jwt.strategy.spec.ts
apps/api/src/modules/auth/otp-security.spec.ts
apps/api/src/modules/auth/presentation/auth-cookie.interceptor.ts
apps/api/src/modules/auth/presentation/auth-csrf.ts
apps/api/src/modules/auth/presentation/controllers/auth.controller.ts
apps/api/src/modules/customer-accounts/infrastructure/repositories/customer-account.repository.ts
apps/api/src/modules/customers/application/customer-directory.service.ts
apps/api/src/modules/customers/application/customers.service.ts
apps/api/src/modules/customers/application/dto/customer-response.dto.ts
apps/api/src/modules/customers/application/dto/register-customer.dto.ts
apps/api/src/modules/customers/customers.service.spec.ts
apps/api/src/modules/customers/domain/entities/customer.entity.ts
apps/api/src/modules/customers/infrastructure/repositories/customer.repository.ts
apps/api/src/modules/customers/presentation/controllers/customers.controller.ts
apps/api/src/modules/kyc/application/dto/complete-identity.dto.ts
apps/api/src/modules/kyc/application/kyc.service.ts
apps/api/src/modules/kyc/domain/kyc-workflow.ts
apps/api/src/modules/kyc/presentation/controllers/kyc.controller.ts
apps/api/src/modules/notifications/application/notification.service.ts
apps/api/src/modules/orders/presentation/controllers/orders.controller.ts
apps/api/src/modules/payments/presentation/controllers/payment.controller.ts
apps/api/src/modules/pickups/presentation/controllers/pickups.controller.ts
apps/api/src/modules/sessions/application/session-enforcement.service.ts
apps/api/src/modules/sessions/application/session-enforcement.spec.ts
apps/api/src/modules/sms/infrastructure/providers/melipayamak.provider.ts
apps/api/src/modules/sms/infrastructure/providers/routing-sms.provider.ts
apps/api/src/modules/sms/infrastructure/providers/smsir.provider.ts
apps/api/src/modules/users/application/users.service.ts
apps/web/src/__tests__/auth.test.ts
apps/web/src/__tests__/buy-gold.test.tsx
apps/web/src/__tests__/customer-auth.test.tsx
apps/web/src/__tests__/header-kyc-status.test.tsx
apps/web/src/app/dashboard/login/page.tsx
apps/web/src/app/portal/dashboard/page.tsx
apps/web/src/app/portal/login/page.tsx
apps/web/src/app/portal/pickups/new/page.tsx
apps/web/src/components/auth/password-recovery-form.tsx
apps/web/src/components/dashboard/customer-widgets.tsx
apps/web/src/components/portal/buy-gold/buy-gold-page.tsx
apps/web/src/components/portal/header-kyc-status.tsx
apps/web/src/components/portal/kyc/kyc-experience.tsx
apps/web/src/components/portal/payments/submit-receipt-sheet.tsx
apps/web/src/components/portal/payments/withdraw-request-sheet.tsx
apps/web/src/lib/api.ts
apps/web/src/lib/auth.tsx
apps/web/src/lib/internal-api.ts
apps/web/tsconfig.json
docs/customer-auth.md
prisma/migrations/202611050001_customer_auth/migration.sql
prisma/schema.prisma
scripts/auth-mobile-preflight.js
```
