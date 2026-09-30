import { formatDateTime } from '@/lib/utils';
import type { CreditFigures } from '@/lib/credit-view';
import { CreditSection, CreditStatusPill, formatCreditMoney } from './credit-ui';

export function CreditDetails({
  figures,
  className,
}: {
  figures: CreditFigures;
  className?: string;
}) {
  return (
    <CreditSection title="اطلاعات اعتبار" id="credit-details-title" className={className}>
      <dl className="mt-4 divide-y divide-[#E5E7EB]">
        <Detail label="سقف اعتبار" value={formatCreditMoney(figures.limit)} />
        <Detail label="اعتبار در دسترس" value={formatCreditMoney(figures.available)} />
        <Detail label="اعتبار رزرو شده" value={formatCreditMoney(figures.reserved)} />
        <Detail label="اعتبار مصرف شده" value={formatCreditMoney(figures.consumed)} />
        <div className="flex items-center justify-between gap-3 py-3">
          <dt className="text-sm text-[#6B7280]">وضعیت اعتبار</dt>
          <dd>
            <CreditStatusPill status={figures.status} />
          </dd>
        </div>
        <Detail label="آخرین بروزرسانی" value={formatDateTime(figures.updatedAt)} />
      </dl>
      {figures.gold ? (
        <div className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-3">
          <p className="text-sm font-semibold text-[#202124]">اعتبار طلایی</p>
          <dl className="mt-2 space-y-2">
            <Detail label="سقف" value={formatCreditMoney(figures.gold.limit)} compact />
            <Detail label="رزرو شده" value={formatCreditMoney(figures.gold.reserved)} compact />
            <Detail label="مصرف شده" value={formatCreditMoney(figures.gold.consumed)} compact />
          </dl>
          <p className="mt-2 text-xs leading-5 text-[#6B7280]">
            ظرفیت طلایی بر اساس قیمت لحظه‌ای محاسبه می‌شود و توسط سرور تأیید می‌شود.
          </p>
        </div>
      ) : null}
    </CreditSection>
  );
}

function Detail({
  label,
  value,
  compact,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${compact ? 'text-xs' : 'py-3 text-sm'}`}>
      <dt className="text-[#6B7280]">{label}</dt>
      <dd className="text-left font-semibold tabular-nums text-[#202124]">{value}</dd>
    </div>
  );
}
