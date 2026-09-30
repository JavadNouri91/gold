# 13 — Credit & Gold Ledger

## اصل
مانده حساب باید از تراکنش‌ها قابل محاسبه باشد.

## Customer Account
حساب مشتری می‌تواند:
- Rial Credit
- Gold Credit/Balance
- Receivable
- Payable
را نگهداری/نمایش دهد.

## Credit Transaction Types
- GRANT
- INCREASE
- DECREASE
- CONSUME
- RELEASE
- EXPIRE
- ADJUSTMENT
- REVERSAL

## Gold Ledger
هر ورود/خروج طلایی باید:
- quantity
- unit
- purity
- direction
- source
- timestamp
داشته باشد.

## تفاوت با Inventory
Gold Ledger نشان‌دهنده حق/تعهد یا مانده طلایی حساب است و الزاماً نشان‌دهنده قطعه فیزیکی مشخص در انبار نیست.

## Controls
- جلوگیری از مصرف بیش از اعتبار مجاز
- Permission برای Adjustment
- Audit برای تغییرات
- Idempotency برای posting
- Reversal به جای حذف

## Balance
Balance باید از Ledger یا projection قابل اعتماد آن به دست آید.
