# Session limits

Concurrent sign-ins are the existing refresh-token rows. A new login does not create a second session system.

## Precedence

The effective policy is chosen in this order:

1. User override, when the user policy mode is `CUSTOM`.
2. Role policy, for every assigned role that does not use the global default. If several roles are custom, the smallest session ceiling wins. `BLOCK` is preferred over `REVOKE_OLDEST` when the ceilings are equal.
3. Global default (`session_settings.id = global`).

A missing role or user row means “inherit”. The seeded global default is 1 session and `BLOCK`.

Allowed ceilings are 1, 2, 3, 5, or unlimited. Role and user overrides can choose `BLOCK` or `REVOKE_OLDEST`. `REQUIRE_CONFIRMATION` is only a global behavior: the login stays incomplete until the user picks an active session to revoke.

## Lifecycle

1. OTP verification resolves the policy inside a transaction that locks the user row (`SELECT … FOR UPDATE`).
2. Active sessions are refresh tokens with `revoked_at` null and `expires_at` in the future.
3. Under the ceiling, a new row is inserted. The raw refresh secret is returned once. Only its SHA-256 hash is stored.
4. At the ceiling, `BLOCK` rejects the login, `REVOKE_OLDEST` sets `revoked_at` on the oldest rows and then inserts, and `REQUIRE_CONFIRMATION` stores a short-lived confirmation hash.
5. Refresh rotation replaces `token_hash` on the same row. It does not consume another slot.
6. Logout and explicit revoke set `revoked_at`. Rows are not deleted.

Access tokens issued after this change include `sid`. Every authenticated request rejects a missing, revoked, or expired session. Tokens issued before this change have no `sid` and stay valid until the access token itself expires.

`last_activity_at` is updated at most once every five minutes.

## Configuration

Staff with `session.policy.manage` open **مدیریت نشست** under the system menu (`/dashboard/settings/sessions`).

- Global default and role rows require `session.policy.manage`.
- A user override also accepts `user.manage`.
- A signed-in user can list and revoke their own sessions. Revoking the current device or every other device asks for confirmation.

Changes are written to the existing audit log: `LOGIN`, `LOGIN_BLOCKED_SESSION_LIMIT`, `SESSION_CREATED`, `SESSION_REVOKED`, `SESSION_REVOKED_BY_ADMIN`, `ALL_OTHER_SESSIONS_REVOKED`, `SESSION_POLICY_CHANGED`, `USER_SESSION_OVERRIDE_CHANGED`. Passwords, refresh secrets, and token hashes are not logged.

## Security notes

Authentication remains bearer tokens in the SPA, not cookies. The API already sends `helmet` and does not put the refresh secret in a cookie. Session identifiers are 32 random bytes. Production must keep `DATABASE_URL` on TLS and the API behind HTTPS so bearer tokens are not sent in clear text.
