import { isZeroDecimal } from '@/lib/decimal-string';
import type { CreditFigures } from '@/lib/credit-view';
import { formatCreditAmount, formatShare } from './credit-ui';

const CARDS = [
  {
    key: 'available',
    label: 'اعتبار در دسترس',
    amount: (figures: CreditFigures) => figures.available,
    percent: (figures: CreditFigures) => figures.availablePercent,
    className: 'border-green-200 bg-green-50',
    labelClass: 'text-[#16A34A]',
    valueClass: 'text-[#166534]',
  },
  {
    key: 'reserved',
    label: 'اعتبار رزرو شده',
    amount: (figures: CreditFigures) => figures.reserved,
    percent: (figures: CreditFigures) => figures.reservedPercent,
    className: 'border-amber-200 bg-amber-50',
    labelClass: 'text-[#B45309]',
    valueClass: 'text-[#92400E]',
  },
  {
    key: 'consumed',
    label: 'اعتبار مصرف شده',
    amount: (figures: CreditFigures) => figures.consumed,
    percent: (figures: CreditFigures) => figures.consumedPercent,
    className: 'border-red-200 bg-red-50',
    labelClass: 'text-[#DC2626]',
    valueClass: 'text-[#991B1B]',
  },
] as const;

export function CreditSummaryCards({ figures }: { figures: CreditFigures }) {
  const reservedEmpty = isZeroDecimal(figures.reserved);
  return (
    <>
      {CARDS.map((card) => (
        <article
          key={card.key}
          className={`min-w-0 rounded-2xl border p-2.5 shadow-sm min-[390px]:p-3 sm:p-4 ${card.className}`}
        >
          <p className={`text-[11px] font-semibold leading-4 sm:text-xs ${card.labelClass}`}>{card.label}</p>
          <p className={`mt-2 break-words text-[11px] font-bold leading-5 tabular-nums min-[390px]:text-sm sm:text-base ${card.valueClass}`}>
            {formatCreditAmount(card.amount(figures))}
          </p>
          <p className="text-[10px] text-[#6B7280]">ریال</p>
          <p className={`mt-2 text-xs font-bold tabular-nums ${card.labelClass}`}>
            {formatShare(card.percent(figures))}
          </p>
        </article>
      ))}
      {reservedEmpty ? (
        <p className="col-span-full text-xs leading-5 text-[#6B7280]">
          در حال حاضر اعتبار رزرو شده‌ای ندارید.
        </p>
      ) : null}
    </>
  );
}
