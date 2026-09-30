# 05 — Use Cases

## UC-01 Register Customer
**Actor:** Customer  
**Precondition:** شماره/شناسه لازم موجود نیست.  
**Flow:** فرم → اعتبارسنجی → ایجاد Registration Request.  
**Result:** وضعیت Pending Verification.

## UC-02 Submit Documents
**Actor:** Customer  
**Flow:** انتخاب نوع مدرک → Upload → Validation → ذخیره امن → KYC Pending.

## UC-03 Verify Customer
**Actor:** Reviewer/Operator  
**Flow:** مشاهده اطلاعات → بررسی مدارک → Approve/Reject → ثبت دلیل.  
**Result:** Customer Verified یا Rejected.

## UC-04 Assign Customer Type
**Actor:** Authorized Staff  
**Flow:** انتخاب Household/Partner/VIP → ثبت تغییر → Audit.

## UC-05 Grant Credit
**Actor:** Manager  
**Flow:** انتخاب مشتری → نوع اعتبار → مقدار → دلیل → ثبت Ledger/Limit.

## UC-06 View Live Price
**Actor:** Customer/Staff  
**Flow:** دریافت آخرین Price Snapshot معتبر.

## UC-07 Place Order
**Actor:** Customer  
**Flow:** انتخاب مقدار/شرایط → محاسبه قیمت → تأیید اطلاعات → Create Order.

## UC-08 Generate Quotation
**Actor:** System  
**Flow:** پس از Order → Snapshot pricing → Generate Quotation → Download availability.

## UC-09 Assign Order
**Actor:** Operator/Manager  
**Flow:** انتخاب User → Assignment → Notification.

## UC-10 Review Trade
**Actor:** Reviewer  
**Flow:** مشاهده Order/Quotation/Price Snapshot → بررسی → Approve/Reject/Revision.

## UC-11 Confirm Trade
**Actor:** System after approval  
**Flow:** Lock trade terms → create Trade → create relevant ledger effects.

## UC-12 Record Payment
**Actor:** Accountant/Authorized User  
**Flow:** payment → validation → allocation → ledger → settlement update.

## UC-13 Create Upstream Purchase
**Actor:** Manager/Operator  
**Flow:** انتخاب Provider → ثبت Purchase → Rial/Gold settlement terms → ledger.

## UC-14 Manage Supplier Account
**Actor:** Accountant/Manager  
**Flow:** مشاهده بدهی/طلب → ثبت settlement → reconciliation.

## UC-15 Reports
**Actor:** Manager/Accountant  
**Flow:** filter → calculate → export/view.

## UC-16 Audit Review
**Actor:** Manager/Admin  
**Flow:** filter logs → inspect actor/action/time/entity.
