# 12 — Pricing Engine

## Goal
تبدیل قیمت مرجع خارجی به قیمت قابل معامله در سامانه.

## Inputs
- Latest valid PriceSnapshot
- CustomerType
- Weight
- Purity
- PricingRule
- PriceAdjustment
- Wage
- Profit
- Tax
- Discount
- Rounding policy

## Pipeline
```text
External Price
 -> Validation
 -> Normalization
 -> Base Adjustment
 -> Customer Pricing Rules
 -> Weight/Purity Calculation
 -> Wage
 -> Profit
 -> Tax
 -> Discount
 -> Rounding
 -> Final Price
```

## Adjustment
Support:
- +percentage
- -percentage
- +fixed
- -fixed

Adjustmentها باید precedence مشخص داشته باشند.

## Snapshot
PricingCalculation باید تمام ورودی‌های مؤثر را نگه دارد تا محاسبه قابل بازسازی باشد.

## Staleness
اگر PriceSnapshot از TTL تعریف‌شده قدیمی‌تر باشد، Pricing Engine نباید آن را بدون Rule صریح مصرف کند.

## Precision
برای محاسبات مالی از Decimal/Fixed Precision استفاده شود.

## Versioning
هر تغییر مهم در PricingRule باید version یا effective date داشته باشد.

## Future extension
- چند Provider
- fallback provider
- customer-specific pricing
- time-based rules
- risk/spread
