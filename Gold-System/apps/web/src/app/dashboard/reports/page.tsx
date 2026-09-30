import Link from 'next/link';
import { PageHeader } from '@/components/dashboard/page-header';

const LINKS = [
  ['/dashboard/reports/customers', 'مشتریان'],
  ['/dashboard/reports/orders', 'سفارش‌ها'],
  ['/dashboard/reports/trades', 'معاملات'],
  ['/dashboard/reports/payments', 'پرداخت‌ها'],
  ['/dashboard/reports/settlements', 'تسویه'],
  ['/dashboard/reports/financial', 'دفتر مالی'],
  ['/dashboard/reports/gold', 'طلا'],
  ['/dashboard/reports/suppliers', 'تأمین‌کنندگان'],
  ['/dashboard/reports/pricing', 'قیمت'],
];

export default function ReportsHomePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="گزارش‌ها" description="هر گزارش همان خروجی سرویس گزارش است." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(([href, label]) => (
          <li key={href}>
            <Link className="block rounded-xl border bg-white p-4 font-medium hover:bg-gold-50" href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
