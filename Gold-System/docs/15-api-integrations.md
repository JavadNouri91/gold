# 15 — API Integrations

## 15.1 Price Provider
### Responsibilities
- fetch current gold price
- normalize response
- detect stale/invalid data
- persist snapshots

### Requirements
- timeout
- retry with backoff
- rate limit handling
- authentication if required
- monitoring
- circuit breaker/fallback where justified

## 15.2 Upstream Integration
در نسخه اول می‌تواند Manual باشد.
معماری باید طوری باشد که بعداً Provider Adapter اضافه شود.

Interface concept:
```text
PriceProvider
- getLatestPrice()
- getMarketStatus()

UpstreamProviderAdapter
- getQuote()
- createPurchase()
- getAccountBalance()
- reconcile()
```

## 15.3 Identity/KYC integrations
در صورت نیاز بعداً Provider جداگانه.

## 15.4 Notifications
Adapter pattern برای SMS/Email/Push.

## Integration rule
Provider-specific code نباید در Domain Logic پخش شود. از Adapter/Port استفاده شود.
