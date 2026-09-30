# Gold System — Security Architecture

## Authentication
- Argon2 preferred for password hashing.
- Access token short-lived.
- Refresh token rotation.
- Session revocation support.

## Authorization
RBAC + Permission.

Sensitive permissions:
- KYC review
- credit adjustment
- pricing rule modification
- trade approval
- payment reversal
- ledger adjustment
- user/role management

## Data Protection
- HTTPS
- encrypted storage where appropriate
- private document bucket
- signed URLs
- no sensitive documents in logs

## API Security
- DTO validation
- rate limiting
- CORS policy
- security headers
- request size limits
- file upload validation

## Audit
Security-sensitive operations must generate AuditLog.

## Secrets
Secrets only through environment/secret management.

## Production
- disable verbose error output
- restrict database network access
- least privilege DB user
- automated backups
