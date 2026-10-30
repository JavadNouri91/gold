import { DASHBOARD_NAV } from './nav';

/**
 * Breadcrumb labels for the staff dashboard.
 *
 * Every crumb is Persian: URL segments are machine names and must never reach
 * the UI. `DASHBOARD_NAV` is the source of truth for nav-level pages, so a new
 * menu item gets a Persian crumb without touching this map. Sub-pages that have
 * no nav entry are listed here.
 */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'داشبورد',
  admin: 'مدیریت',
  overview: 'نمای کلی',
  customers: 'مشتریان',
  kyc: 'احراز هویت',
  orders: 'سفارش‌ها',
  assignments: 'صف بررسی',
  quotations: 'پیش‌فاکتور',
  quotation: 'پیش‌فاکتور',
  trades: 'معاملات',
  pickups: 'تحویل حضوری',
  payments: 'واریز و برداشت',
  settlements: 'تسویه',
  ledger: 'دفاتر',
  financial: 'دفتر مالی',
  gold: 'دفتر طلا',
  suppliers: 'تأمین‌کنندگان',
  purchases: 'خریدها',
  reports: 'گزارش‌ها',
  audit: 'ممیزی',
  notifications: 'اعلان‌ها',
  pricing: 'قیمت‌گذاری',
  settings: 'تنظیمات',
  fees: 'کارمزدها',
  sessions: 'مدیریت نشست',
  sms: 'تنظیمات پیامک',
  'trading-management': 'برنامه معاملات',
  new: 'ثبت جدید',
  login: 'ورود',
};

/** A record id (cuid, uuid, or number) is never shown as a crumb label. */
const DYNAMIC_SEGMENT = /^(?:\d+|c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const DETAIL_LABEL = 'جزئیات';

const NAV_LABELS = new Map(DASHBOARD_NAV.map((item) => [item.href, item.label]));

export interface Breadcrumb {
  href: string;
  label: string;
}

export function breadcrumbLabel(segment: string, href: string): string {
  if (DYNAMIC_SEGMENT.test(segment)) return DETAIL_LABEL;
  return SEGMENT_LABELS[segment] ?? NAV_LABELS.get(href) ?? DETAIL_LABEL;
}

export function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  const segments = pathname.split('/').filter(Boolean);
  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    return { href, label: breadcrumbLabel(segment, href) };
  });
}
