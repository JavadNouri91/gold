# 07 — Business Rules

## Customer
BR-C01: Customer بدون تأیید KYC نباید معامله عادی ثبت‌شده داشته باشد مگر مسیر موقت مشخصی تعریف شود.  
BR-C02: CustomerType یکی از Household, Partner, VIP است.  
BR-C03: تغییر CustomerType باید Audit شود.  
BR-C04: تغییر اعتبار باید Actor و دلیل داشته باشد.

## Pricing
BR-P01: قیمت API فقط Reference Price است.  
BR-P02: Price Snapshot باید Timestamp داشته باشد.  
BR-P03: هر Quotation باید قیمت‌های مؤثر خود را Snapshot کند.  
BR-P04: Adjustment می‌تواند Percentage یا Fixed باشد و Sign مثبت/منفی داشته باشد.  
BR-P05: محاسبات باید با Decimal دقیق انجام شوند، نه Float.  
BR-P06: Rounding Rule باید صریح و قابل تست باشد.  
BR-P07: قیمت نهایی باید قابل بازسازی باشد.

## Order/Quotation
BR-O01: Order به معنی Trade قطعی نیست.  
BR-O02: Quotation خودکار ایجاد می‌شود.  
BR-O03: Quotation به معنی Trade قطعی نیست.  
BR-O04: Order/Quotation باید قابل Assignment باشد.  
BR-O05: تأیید دستی قبل از Trade قطعی الزامی است.  
BR-O06: Rejection باید دلیل داشته باشد.  
BR-O07: Revision باید نسخه/تاریخچه قابل ردیابی داشته باشد.

## Trade
BR-T01: Trade فقط از مسیر مجاز تأیید ایجاد می‌شود.  
BR-T02: پس از Confirm شدن، Terms اصلی نباید بدون Reversal/Amendment کنترل‌شده تغییر کند.  
BR-T03: Settlement مستقل از Trade است.

## Ledger
BR-L01: Balance از Ledger محاسبه می‌شود.  
BR-L02: اصلاح تراکنش‌های ثبت‌شده با حذف خام انجام نشود؛ Reversal/Adjustment استفاده شود.  
BR-L03: هر Ledger Entry باید Source Reference داشته باشد.

## Purchase
BR-U01: Purchase باید Provider داشته باشد.  
BR-U02: نوع تسویه می‌تواند Rial یا Gold باشد.  
BR-U03: Purchase باید اثر حسابی ایجاد کند.

## Security
BR-S01: Permission در Backend enforce شود.  
BR-S02: عملیات حساس Audit شوند.  
BR-S03: اطلاعات KYC باید دسترسی محدود داشته باشد.
