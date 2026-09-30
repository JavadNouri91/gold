# Open Questions

این فایل محل ثبت تصمیم‌هایی است که برای تکمیل Domain باید با کارفرما/کسب‌وکار نهایی شوند.

آیتم‌های حل‌شده به `docs/21-business-decisions.md` منتقل شده‌اند.
وضعیت: ✅ RESOLVED | 🔴 OPEN | 🟡 DEFERRED

---

## Pricing

| # | Question | Status | Reference |
|---|---|---|---|
| 1 | واحد دقیق قیمت API چیست؟ | 🔴 OPEN | §13.1 of 21-business-decisions.md |
| 2 | فرمول دقیق تبدیل قیمت API به قیمت طلای آب‌شده چیست؟ | 🔴 OPEN | §13.1 |
| 3 | عیار مرجع چیست؟ | 🔴 OPEN | §13.1 |
| 4 | اجرت چگونه محاسبه می‌شود؟ | ✅ RESOLVED | §1.6 of 21-business-decisions.md |
| 5 | سود روی کدام base اعمال می‌شود؟ | 🔴 OPEN | §13.2 of 21-business-decisions.md |
| 6 | مالیات روی کدام جزء اعمال می‌شود؟ | 🔴 OPEN | §13.3 of 21-business-decisions.md |
| 7 | تخفیف قبل یا بعد از مالیات است؟ | ✅ RESOLVED | §1.3 of 21-business-decisions.md |
| 8 | قیمت در زمان Order lock می‌شود یا Approval؟ | ✅ RESOLVED | §2.1 of 21-business-decisions.md |
| 9 | مدت اعتبار Quotation چقدر است؟ | ✅ RESOLVED | §2.3 of 21-business-decisions.md |
| 10 | در صورت تغییر قیمت، آیا مشتری باید تأیید مجدد کند؟ | ✅ RESOLVED | §2.2 of 21-business-decisions.md |

## Credit

| # | Question | Status | Reference |
|---|---|---|---|
| 11 | اعتبار ریالی دقیقاً چه معنایی دارد؟ | ✅ RESOLVED | §3.1 of 21-business-decisions.md |
| 12 | اعتبار طلایی چه معنایی دارد؟ | ✅ RESOLVED | §3.2 of 21-business-decisions.md |
| 13 | سقف اعتبار چگونه تعیین می‌شود؟ | 🔴 OPEN | Set by Store Manager via CustomerAccount management; exact workflow TBD |
| 14 | مصرف اعتبار هنگام Order است یا Trade؟ | ✅ RESOLVED | §3.3 of 21-business-decisions.md |
| 15 | در Reject چه اتفاقی برای رزرو اعتبار می‌افتد؟ | ✅ RESOLVED | §3.5 of 21-business-decisions.md |

## Trade

| # | Question | Status | Reference |
|---|---|---|---|
| 16 | چه شخص/نقشی مجاز به Approval است؟ | ✅ RESOLVED | §5.1 of 21-business-decisions.md |
| 17 | آیا دو مرحله Approval لازم است؟ | 🔴 OPEN (partial) | §5.2 — dual approval confirmed; threshold and second approver role OPEN |
| 18 | آیا Approval قابل برگشت است؟ | ✅ RESOLVED | §5.3 of 21-business-decisions.md |
| 19 | شرایط Cancellation چیست؟ | ✅ RESOLVED | §4 of 21-business-decisions.md |

## Purchase

| # | Question | Status | Reference |
|---|---|---|---|
| 20 | خرید از بالادستی چگونه تسویه می‌شود؟ | 🟡 DEFERRED | §8.4 — not in MVP |
| 21 | آیا بالادستی نیز Price API مستقل دارد؟ | 🟡 DEFERRED | §11.2 — manual entry in MVP |
| 22 | خرید طلایی چگونه در Gold Ledger ثبت می‌شود؟ | 🔴 OPEN | §6.2 — GA-01 account defined; exact posting rules TBD |

## Accounting

| # | Question | Status | Reference |
|---|---|---|---|
| 23 | Chart of Accounts مورد نیاز چقدر جزئی است؟ | ✅ RESOLVED | §6 of 21-business-decisions.md |
| 24 | سود معامله دقیقاً چگونه تعریف می‌شود؟ | 🔴 OPEN | §13.2 — profit base not yet defined |
| 25 | هزینه‌ها چه دسته‌هایی دارند؟ | 🔴 OPEN | §13.5 — FA-15 confirmed; sub-categories not defined |

## KYC

| # | Question | Status | Reference |
|---|---|---|---|
| 26 | مدارک الزامی چیست؟ | ✅ RESOLVED | §7.1 of 21-business-decisions.md |
| 27 | روش احراز هویت چیست؟ | ✅ RESOLVED | Manual review + OTP; §11.1 |
| 28 | چه کسی مجاز به دیدن مدارک است؟ | ✅ RESOLVED | §7.3 of 21-business-decisions.md |
| 29 | Retention مدارک چقدر است؟ | ✅ RESOLVED | §7.2 — 7 years |

## Integration

| # | Question | Status | Reference |
|---|---|---|---|
| 30 | Provider قیمت دقیقاً چه API/فرمت/واحدی دارد؟ | 🔴 OPEN | §13.1 — provider not selected |
| 31 | Notification provider چیست؟ | 🔴 OPEN (non-blocking) | §13.6 — SMS.ir or Melipayamak; final selection TBD |
| 32 | آیا Upstream API در MVP وجود دارد؟ | ✅ RESOLVED | §11.2 — manual only in MVP |

---

## New Open Items (identified during clarification session)

| # | Question | Status | Reference |
|---|---|---|---|
| 33 | Dual approval: threshold amount (Toman)? | 🔴 OPEN | §13.4 of 21-business-decisions.md |
| 34 | Dual approval: second approver role? | 🔴 OPEN | §13.4 of 21-business-decisions.md |
| 35 | Profit calculation base (which step of pipeline)? | 🔴 OPEN | §13.2 of 21-business-decisions.md |
| 36 | Tax percentage and taxable base? | 🔴 OPEN | §13.3 of 21-business-decisions.md |
| 37 | Expense sub-categories under FA-15? | 🔴 OPEN | §13.5 of 21-business-decisions.md |
| 38 | Credit limit management workflow — who sets it and how? | 🔴 OPEN | §3 implied; workflow not fully described |
| 39 | Gold purchase from upstream: which Gold Ledger account is credited (GA-01)? Posting rules? | 🔴 OPEN | §6.2 |
| 40 | Online payment gateway provider (future)? | 🟡 DEFERRED | §9 of 21-business-decisions.md |
