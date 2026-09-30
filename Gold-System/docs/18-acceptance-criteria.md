# 18 — Acceptance Criteria

## Customer onboarding
- کاربر بتواند ثبت‌نام کند.
- مدارک ذخیره امن شوند.
- Reviewer بتواند درخواست را تأیید/رد کند.
- بدون تأیید، وضعیت معامله طبق Business Rule محدود باشد.
- CustomerType قابل ثبت و Audit باشد.

## Pricing
- قیمت معتبر از Provider دریافت شود.
- API failure باعث crash نشود.
- Adjustment درصدی و ثابت کار کند.
- افزایش و کاهش پشتیبانی شود.
- محاسبه با Decimal باشد.
- Pricing Snapshot قابل بازسازی باشد.

## Order
- Customer بتواند Order بسازد.
- Order خودکار Quotation ایجاد کند.
- Quotation دانلود شود.
- Order به User اختصاص یابد.
- Order تا تأیید دستی Trade قطعی ایجاد نکند.

## Approval
- Reviewer بتواند Approve/Reject/Revision کند.
- Reject reason اجباری باشد.
- Approval actor و timestamp ذخیره شود.
- پس از Approval Trade ساخته شود.

## Payment/Settlement
- چند Payment برای یک Trade پشتیبانی شود.
- Allocation دقیق باشد.
- Settlement وضعیت صحیح داشته باشد.
- Reversal قابل انجام و Audit باشد.

## Ledger
- هر posting source داشته باشد.
- Balance قابل بازسازی باشد.
- حذف خام Ledger ممنوع باشد.

## Purchase
- خرید از Provider ثبت شود.
- خرید ریالی/طلایی پشتیبانی شود.
- Supplier Account به‌روزرسانی شود.

## Audit
- عملیات حساس لاگ شوند.
- لاگ قابل جستجو باشد.
