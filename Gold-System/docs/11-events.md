# 11 — Events

## Customer Events
- CustomerRegistrationSubmitted
- CustomerDocumentsSubmitted
- CustomerKycStarted
- CustomerApproved
- CustomerRejected
- CustomerTypeAssigned
- CustomerCreditGranted
- CustomerCreditAdjusted

## Pricing Events
- PriceFetched
- PriceUpdated
- PriceFeedFailed
- PricingRuleChanged
- PricingCalculated

## Order Events
- OrderCreated
- OrderUpdated
- OrderCancelled
- QuotationGenerated
- QuotationExpired
- OrderAssigned
- RevisionRequested

## Trade Events
- TradeReviewStarted
- TradeApproved
- TradeRejected
- TradeConfirmed
- TradeCancelled
- TradeReversed

## Payment Events
- PaymentCreated
- PaymentValidated
- PaymentAllocated
- SettlementStarted
- SettlementCompleted
- PaymentReversed

## Purchase Events
- PurchaseCreated
- PurchaseConfirmed
- PurchaseSettled

## Event principles
- Events should be immutable facts.
- Commands cause state changes; events describe completed facts.
- Critical events should carry entity id, actor/system source, timestamp, correlation id.
- Events must not expose sensitive KYC data unnecessarily.
