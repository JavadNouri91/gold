# Gold System

سامانه آنلاین مدیریت و انجام معاملات طلای آب‌شده برای یک طلافروشی واحد.

## هدف
این پروژه چرخه کامل مشتری، احراز هویت، قیمت لحظه‌ای، سفارش، پیش‌فاکتور، ارجاع و تأیید دستی معامله، خرید از بالادستی، اعتبار ریالی/طلایی، پرداخت، تسویه و حسابداری داخلی را مدیریت می‌کند.

## Scope فعلی
- یک فروشگاه واحد
- مشتریان: خانگی، همکار، VIP
- احراز هویت و بررسی مدارک
- قیمت لحظه‌ای از API خارجی با بازه تقریبی ۱ تا ۲ دقیقه
- Price Adjustment روی قیمت API
- Pricing Engine
- سفارش آنلاین مشتری
- صدور خودکار پیش‌فاکتور
- ارجاع سفارش/معامله به اپراتور یا فروشنده
- تأیید دستی قبل از قطعی شدن معامله
- معاملات طلای آب‌شده
- اعتبار ریالی و طلایی
- خرید ریالی/طلایی از بالادستی
- حسابداری داخلی ساده
- پرداخت و تسویه
- Audit Log و Notification

## اصول معماری
1. Order با Trade یکی نیست.
2. Quotation به‌تنهایی معامله قطعی نیست.
3. Trade فقط پس از تأیید دستی قطعی می‌شود.
4. موجودی فیزیکی سنتی در نسخه فعلی هسته سیستم نیست.
5. Gold Balance با Physical Inventory متفاوت است.
6. قیمت API قیمت مرجع است و الزاماً قیمت نهایی نیست.
7. تمام قیمت‌های مؤثر در سفارش/معامله باید Snapshot شوند.
8. تراکنش‌های مالی و طلایی باید قابل ردیابی و Audit باشند.
9. تغییرات مهم نباید با ویرایش مستقیم مانده‌ها انجام شوند؛ Ledger مبنای محاسبات است.
10. هر عملیات حساس باید Actor، زمان، وضعیت قبل و بعد و Reference داشته باشد.

## ساختار مستندات
- `docs/01-project-scope.md`
- `docs/02-business-requirements.md`
- `docs/03-functional-requirements.md`
- `docs/04-actors-and-permissions.md`
- `docs/05-use-cases.md`
- `docs/06-user-stories.md`
- `docs/07-business-rules.md`
- `docs/08-workflows.md`
- `docs/09-domain-model.md`
- `docs/10-entities.md`
- `docs/11-events.md`
- `docs/12-pricing-engine.md`
- `docs/13-credit-and-gold-ledger.md`
- `docs/14-accounting.md`
- `docs/15-api-integrations.md`
- `docs/16-notifications-and-audit.md`
- `docs/17-non-functional-requirements.md`
- `docs/18-acceptance-criteria.md`
- `docs/19-implementation-roadmap.md`
- `docs/20-cursor-development-guide.md`
