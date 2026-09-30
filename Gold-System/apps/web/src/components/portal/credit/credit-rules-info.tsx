import { creditCardClass } from './credit-ui';

export function CreditRulesInfo() {
  return (
    <section aria-labelledby="credit-rules-title" className={`${creditCardClass} border-blue-100 bg-blue-50/60`}>
      <h2 id="credit-rules-title" className="text-base font-bold text-[#202124]">
        نحوه محاسبه اعتبار
      </h2>
      <p className="mt-3 text-sm leading-7 text-[#202124]">
        اعتبار هنگام ثبت سفارش رزرو می‌شود و تا زمان بررسی مسدود می‌ماند. پس از تأیید معامله، مبلغ
        رزروشده مصرف‌شده محسوب می‌شود. در صورت رد یا لغو سفارش، اعتبار رزروشده بلافاصله آزاد می‌شود.
      </p>
    </section>
  );
}
