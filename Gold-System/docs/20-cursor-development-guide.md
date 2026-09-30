# 20 — Cursor Development Guide

## هدف
این مستندات باید به Cursor به‌عنوان Source of Truth پروژه داده شوند.

## اصل مهم
Cursor نباید بر اساس حدس Business Rule جدید بسازد.

اگر Requirement مبهم است:
1. آن را در `docs/open-questions.md` ثبت کند.
2. implementation موقت بدون تأیید انجام ندهد، مگر برای بخش غیرحساس.

## ترتیب کار با Cursor
### Step 1
ابتدا کل `docs/` را به Cursor معرفی کن.

Prompt:
```text
این پروژه Gold System است. تمام فایل‌های docs/ را به‌عنوان Source of Truth تحلیل کن.
فعلاً هیچ کدی ننویس.
ابتدا معماری پیشنهادی، bounded contextها، entityها، state machineها و ابهامات را استخراج کن.
هر تناقض را گزارش کن.
```

### Step 2
بعد از تأیید معماری:
```text
بر اساس docs/ یک Technical Design ایجاد کن.
هیچ Business Rule جدیدی اضافه نکن.
برای تصمیم‌های فنی که روی رفتار کسب‌وکار اثر دارند، قبل از implementation آن‌ها را به صورت سؤال مطرح کن.
```

### Step 3
Implementation را Vertical Slice انجام بده:
1. Auth/User
2. Customer/KYC
3. Price Feed
4. Pricing
5. Order/Quotation
6. Assignment/Review
7. Trade
8. Credit/Gold Ledger
9. Purchase
10. Payment/Settlement
11. Reports/Audit

## قواعد توسعه
- هر feature باید test داشته باشد.
- هر تغییر Domain باید docs را نیز به‌روزرسانی کند.
- Financial/GOLD posting باید idempotent باشد.
- هیچ ledger entry حذف نشود.
- state transitionها explicit باشند.
- API contract قبل از frontend integration مشخص باشد.

## Definition of Done
Feature زمانی Done است که:
- requirement پوشش داده شده
- backend validation دارد
- authorization دارد
- test دارد
- audit در صورت نیاز دارد
- error handling دارد
- docs به‌روز شده
- migration/repository changes کامل است
- acceptance criteria پاس شده

## Cursor Review Prompt
```text
کدی که برای این feature نوشته‌ای را با docs/ مقایسه کن.
1. Business Rule نقض‌شده را پیدا کن.
2. authorization gaps را پیدا کن.
3. race condition و idempotency مشکل‌دار را پیدا کن.
4. financial calculation را بررسی کن.
5. تست‌های ناقص را فهرست کن.
6. بدون تغییر کد، گزارش review بده.
```

## اصل امنیتی
کلیدهای API، credentialها و داده‌های حساس نباید داخل prompt، source code یا repository commit شوند.
