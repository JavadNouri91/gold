# Deployment — استقرار و فایل‌سیستم محلی

این سند نحوه استقرار production و مدیریت فایل‌های آپلودشده (KYC، پیش‌فاکتور، رسید پرداخت، آواتار) را شرح می‌دهد. نسخه فعلی از فایل‌سیستم محلی به‌جای S3/MinIO استفاده می‌کند.

## ذخیره‌سازی فایل‌ها

- ریشه ذخیره‌سازی با `STORAGE_LOCAL_ROOT` مشخص می‌شود. در production مقدار آن `/opt/gold/data/uploads` است.
- هر bucket منطقی یک زیرپوشه در این ریشه است و **غیرقابل تغییر** است (زیرا نام bucket در کلیدهای موجود دیتابیس ثبت شده است):
  - `gold-kyc` (فایل‌های عمومی: آواتار، رسید پرداخت، پیش‌فاکتور)
  - `gold-kyc-documents` (مدارک KYC)
  - `gold-quotations` (پیش‌فاکتورهای تولیدشده — در صورت استفاده از bucket جداگانه)
- هیچ مسیر فایل‌سیستمی به کلاینت برگردانده نمی‌شود و فایل‌ها فقط از طریق API احراز هویت‌شده دانلود می‌شوند.

## مجوزها و مالکیت

```bash
sudo mkdir -p /opt/gold/data/uploads
sudo chown -R <app-user>:<app-user> /opt/gold/data/uploads
sudo chmod 700 /opt/gold/data/uploads
```

- پوشه root با مجوز `0700` ساخته می‌شود و فایل‌ها با `0600` نوشته می‌شوند.
- این مسیر باید بیرون از root وب (مثلاً Nginx) باشد؛ **هیچ** alias استاتیک برای آن در Nginx تعریف نکنید.

## Nginx / Reverse Proxy

- فقط مسیرهای API و وب را پروکسی کنید.
- برای `/opt/gold/data/uploads` هیچ `location` استاتیکی ننویسید.
- پورت‌های دیتابیس و storage را به‌صورت عمومی expose نکنید. PostgreSQL فقط روی `127.0.0.1` bind شود (`127.0.0.1:5432:5432` در docker-compose).

## متغیرهای محیطی

```env
STORAGE_LOCAL_ROOT=/opt/gold/data/uploads
STORAGE_BUCKET=gold-kyc
STORAGE_BUCKET_KYC=gold-kyc-documents
STORAGE_BUCKET_QUOTATIONS=gold-quotations
```

- `STORAGE_LOCAL_ROOT` در production باید مسیر absolute باشد؛ در غیر این صورت راه‌اندازی با خطای validation متوقف می‌شود.
- متغیرهای قدیمی S3 (`STORAGE_ENDPOINT`، `STORAGE_ACCESS_KEY`، `STORAGE_SECRET_KEY`، `STORAGE_REGION`) حذف شده‌اند و از محیط production حذف شوند.

## Backup و Restore

دو جزء باید پشتیبان‌گیری شود:

1. **PostgreSQL** — `pg_dump` روزانه با retention policy و تست restore دوره‌ای.
2. **فایل‌های آپلودشده** — کل مسیر `/opt/gold/data/uploads`:

```bash
tar -czf "uploads-$(date +%F).tar.gz" -C /opt/gold/data uploads
```

Restore شامل برگرداندن dump دیتابیس و extract آرشیو فایل‌ها در همان مسیر است. کلیدهای دیتابیس و مسیر فایل‌ها باید هماهنگ بمانند.

## مهاجرت از MinIO/S3 موجود

اگر روی استقرار قبلی فایل‌هایی در MinIO بوده است، یک‌بار آن‌ها را به ساختار فایل‌سیستم منتقل کنید:

```bash
mc alias set legacy http://minio-host:9000 minioadmin minioadmin
mc mirror --overwrite legacy/gold-kyc              /opt/gold/data/uploads/gold-kyc
mc mirror --overwrite legacy/gold-kyc-documents    /opt/gold/data/uploads/gold-kyc-documents
mc mirror --overwrite legacy/gold-quotations       /opt/gold/data/uploads/gold-quotations
```

کلید اشیاء همان مسیر نسبی فایل می‌شود؛ بنابراین هیچ تغییری در دیتابیس لازم نیست.

## اجرای Docker Compose

- فقط `postgres` به‌صورت container اجرا می‌شود. سرویس MinIO حذف شده است.
- volume خصوصی `uploads_data` در مسیر `/opt/gold/data/uploads` داخل container سرویس `api` mount شده و `STORAGE_LOCAL_ROOT` متناظر آن تنظیم شده است.
