import Link from 'next/link';
import { assetCardClass } from './assets-ui';

const REPORTS = [
  {
    title: 'گزارش دارایی',
    description: 'خلاصه موجودی طلای آبشده در همین صفحه',
    href: '#gold-balance',
  },
  {
    title: 'گزارش معاملات',
    description: 'فهرست معاملات ثبت‌شده شما',
    href: '/portal/trades',
  },
  {
    title: 'گزارش سود و زیان',
    description: 'بازه‌های عملکرد دارایی در همین صفحه',
    href: '#portfolio-performance',
  },
] as const;

export function AssetReports() {
  return (
    <section aria-labelledby="reports-title" className={assetCardClass}>
      <h2 id="reports-title" className="text-base font-bold text-[#202124]">
        گزارش دارایی
      </h2>
      <p id="report-download-note" className="mt-2 text-xs leading-5 text-[#6B7280]">
        دانلود فایل گزارش برای مشتری هنوز فعال نیست.
      </p>
      <ul className="mt-4 space-y-3">
        {REPORTS.map((report) => (
          <li key={report.title} className="rounded-xl border border-[#E5E7EB] px-3 py-3">
            <p className="text-sm font-bold text-[#202124]">{report.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#6B7280]">{report.description}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled
                aria-describedby="report-download-note"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#E5E7EB] px-3 text-sm font-semibold text-[#6B7280] disabled:cursor-not-allowed disabled:opacity-70"
              >
                دانلود گزارش
              </button>
              <Link
                href={report.href}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#C8922E] px-3 text-sm font-semibold text-white"
              >
                مشاهده گزارش
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
