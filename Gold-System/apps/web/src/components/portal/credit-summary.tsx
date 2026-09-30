'use client';
import { Card, CardContent } from '@/components/ui/card';
import { formatRial } from '@/lib/utils';
import type { CustomerAccount } from '@/lib/api';

interface CreditSummaryProps {
  account: CustomerAccount;
}

export function CreditSummary({ account }: CreditSummaryProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <CreditItem
        label="اعتبار در دسترس"
        value={account.availableCreditRial}
        className="border-green-200 bg-green-50"
        labelClass="text-green-700"
        valueClass="text-green-800"
      />
      <CreditItem
        label="اعتبار رزرو شده"
        value={account.reservedCreditRial}
        className="border-yellow-200 bg-yellow-50"
        labelClass="text-yellow-700"
        valueClass="text-yellow-800"
      />
      <CreditItem
        label="اعتبار مصرف شده"
        value={account.consumedCreditRial}
        className="border-red-200 bg-red-50"
        labelClass="text-red-700"
        valueClass="text-red-800"
      />
    </div>
  );
}

interface CreditItemProps {
  label: string;
  value: string;
  className?: string;
  labelClass?: string;
  valueClass?: string;
}

function CreditItem({ label, value, className, labelClass, valueClass }: CreditItemProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-4 pb-4">
        <p className={`text-xs font-medium mb-1 ${labelClass}`}>{label}</p>
        <p className={`text-xl font-bold tabular-nums ${valueClass}`}>
          {formatRial(value)}
        </p>
      </CardContent>
    </Card>
  );
}
