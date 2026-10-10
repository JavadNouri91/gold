import Link from 'next/link';
import { ArrowDownToLine, LayoutGrid, ReceiptText } from 'lucide-react';
import { assetCardClass } from './assets-ui';

const ACTIONS = [
  {
    href: '/portal/trades',
    title: 'گزارش معاملات',
    description: 'خرید و فروش‌های انجام‌شده',
    icon: ReceiptText,
    className: 'bg-emerald-50 text-emerald-800',
  },
  {
    href: '/portal/payments',
    title: 'واریز ریال',
    description: 'ثبت رسید افزایش اعتبار',
    icon: ArrowDownToLine,
    className: 'bg-sky-50 text-sky-800',
  },
] as const;

export function AssetQuickActions() {
  return (
    <section aria-labelledby="quick-access-title" className={assetCardClass}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFF4D6] text-[#C8922E]">
          <LayoutGrid className="h-4 w-4" aria-hidden />
        </span>
        <h2 id="quick-access-title" className="text-sm font-bold text-[#202124]">
          دسترسی سریع
        </h2>
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.href + action.title}>
              <Link
                href={action.href}
                className={`flex min-h-11 flex-col justify-center gap-1 rounded-2xl px-4 py-3 ${action.className}`}
              >
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Icon className="h-4 w-4" aria-hidden />
                  {action.title}
                </span>
                <span className="text-xs leading-5 opacity-80">{action.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
