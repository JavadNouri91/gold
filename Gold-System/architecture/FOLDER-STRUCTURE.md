# Gold System — Folder Structure

پیشنهاد ساختار Repository:

```text
gold-system/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   └── styles/
│   │
│   └── api/
│       └── src/
│           ├── common/
│           ├── config/
│           ├── database/
│           ├── modules/
│           │   ├── auth/
│           │   ├── users/
│           │   ├── customers/
│           │   ├── kyc/
│           │   ├── pricing/
│           │   ├── orders/
│           │   ├── quotations/
│           │   ├── assignments/
│           │   ├── trades/
│           │   ├── customer-accounts/
│           │   ├── gold-ledger/
│           │   ├── financial-ledger/
│           │   ├── payments/
│           │   ├── settlements/
│           │   ├── suppliers/
│           │   ├── purchases/
│           │   ├── notifications/
│           │   ├── audit/
│           │   └── reports/
│           └── main.ts
│
├── packages/
│   ├── shared-types/
│   ├── eslint-config/
│   └── tsconfig/
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/
│
├── docs/
├── architecture/
├── tests/
├── docker/
├── .env.example
├── docker-compose.yml
└── README.md
```

## Module structure

مثلاً:

```text
pricing/
├── domain/
│   ├── entities/
│   ├── value-objects/
│   ├── services/
│   └── rules/
│
├── application/
│   ├── commands/
│   ├── queries/
│   └── dto/
│
├── infrastructure/
│   ├── repositories/
│   └── providers/
│
└── presentation/
    └── controllers/
```

## Rule

از ساختارهای بزرگ و عمیق غیرضروری پرهیز شود. وقتی Module کوچک است، ساختار باید متناسب با پیچیدگی واقعی آن باشد.
