# 14 — Accounting

## هدف
ارائه حسابداری داخلی ساده و قابل ردیابی برای عملیات سامانه.

## حساب‌های مفهومی
- Customer Receivable
- Customer Credit
- Supplier Payable
- Cash/Bank
- Sales
- Purchase
- Expense
- Gold Position/Obligation

## Financial Transaction
هر عملیات مالی باید source داشته باشد:
- Trade
- Purchase
- Payment
- Expense
- Credit Adjustment
- Settlement

## نمونه اثر فروش
```text
Trade Confirmed
 -> create financial posting
 -> customer receivable/credit impact
 -> revenue/sales impact according to accounting policy
```

## نمونه اثر خرید
```text
Purchase Confirmed
 -> supplier payable/cash impact
 -> gold position impact where applicable
```

## Payment
Payment ابتدا ثبت و اعتبارسنجی می‌شود، سپس به یک یا چند Target Allocation می‌شود.

## Reversal
پرداخت یا سند مالی اشتباه نباید با حذف فیزیکی از تاریخچه ناپدید شود؛ باید Reversal/Adjustment ثبت شود.

## Reconciliation
گزارش مانده Ledger باید با Account Summary قابل تطبیق باشد.
