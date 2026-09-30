# 03 — Functional Requirements

## FR-01 Authentication
- ورود/خروج
- مدیریت Session
- بازیابی دسترسی
- MFA در صورت نیاز امنیتی

## FR-02 Customer Registration
- فرم ثبت‌نام
- اعتبارسنجی
- ارسال مدارک
- وضعیت درخواست
- جلوگیری از ثبت تکراری

## FR-03 KYC
- صف بررسی
- مشاهده مدارک
- تأیید
- رد با دلیل
- ثبت Reviewer و Timestamp

## FR-04 Customer Management
- مشاهده پروفایل
- گروه مشتری
- وضعیت حساب
- اعتبار
- سوابق معاملات
- سوابق مالی

## FR-05 Price Feed
- دریافت دوره‌ای
- ثبت Provider
- Timestamp
- Raw/Normalized price
- Health status
- آخرین قیمت معتبر

## FR-06 Pricing
- Base Price
- Percentage Adjustment
- Fixed Adjustment
- Customer Pricing Rules
- Wage
- Profit
- Tax
- Discount
- Final Price
- Rounding Rules
- Snapshot

## FR-07 Orders
- Create
- Update تا قبل از Lock
- Cancel
- View
- Status tracking

## FR-08 Quotation
- Auto generation
- Calculation snapshot
- Expiration
- Download
- Revision
- Conversion after approval

## FR-09 Assignment
- Assign to User
- Reassign
- Queue
- Assignment history

## FR-10 Review
- Approve
- Reject
- Request revision
- Comment
- Capture reviewer

## FR-11 Trade
- Create from approved workflow
- Lock relevant terms
- Link to customer
- Link to quotation
- Settlement status

## FR-12 Purchase
- Upstream
- Purchase terms
- Rial/gold settlement
- Account impact
- Documents

## FR-13 Payments
- Create payment
- Method
- Amount
- Reference
- Allocation
- Reversal with controlled workflow

## FR-14 Ledger
- Financial entries
- Gold entries
- Source reference
- Debit/Credit
- Balance

## FR-15 Reports
- Orders
- Trades
- Purchases
- Customer balances
- Supplier balances
- Payments
- Outstanding settlements
- Pricing activity
- Audit

## FR-16 Notifications
- In-app
- SMS/Email/other provider as later integration
- Customer and internal notifications

## FR-17 Audit
- actor
- action
- entity
- entity id
- before/after where applicable
- timestamp
- request/correlation id where useful
