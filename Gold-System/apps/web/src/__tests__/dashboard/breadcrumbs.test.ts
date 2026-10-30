import { breadcrumbLabel, buildBreadcrumbs } from '@/lib/breadcrumbs';

const PERSIAN = /^[\u0600-\u06FF\s‌]+$/;

describe('dashboard breadcrumbs', () => {
  it('labels a nav page from the menu, not the URL segment', () => {
    expect(buildBreadcrumbs('/dashboard/pickups')).toEqual([
      { href: '/dashboard', label: 'داشبورد' },
      { href: '/dashboard/pickups', label: 'تحویل حضوری' },
    ]);
  });

  it('labels sub-pages under a nav page', () => {
    expect(buildBreadcrumbs('/dashboard/settings/sms').map((crumb) => crumb.label)).toEqual([
      'داشبورد',
      'تنظیمات',
      'تنظیمات پیامک',
    ]);
    expect(buildBreadcrumbs('/dashboard/ledger/gold').map((crumb) => crumb.label)).toEqual([
      'داشبورد',
      'دفاتر',
      'دفتر طلا',
    ]);
    expect(buildBreadcrumbs('/admin/trading-management').map((crumb) => crumb.label)).toEqual([
      'مدیریت',
      'برنامه معاملات',
    ]);
  });

  it('replaces an id segment with a Persian detail label', () => {
    expect(buildBreadcrumbs('/dashboard/pickups/PKP-000009').map((crumb) => crumb.label)).toEqual([
      'داشبورد',
      'تحویل حضوری',
      'جزئیات',
    ]);
    expect(
      buildBreadcrumbs('/dashboard/orders/cmvs36fsr000e13ngwx1aolu6/quotation').map(
        (crumb) => crumb.label,
      ),
    ).toEqual(['داشبورد', 'سفارش‌ها', 'جزئیات', 'پیش‌فاکتور']);
  });

  it('never renders a latin URL segment', () => {
    const paths = [
      '/dashboard',
      '/dashboard/pickups',
      '/dashboard/pickups/1234',
      '/dashboard/settings/fees',
      '/dashboard/reports/customers',
      '/dashboard/kyc/cmujw1mn40003ly69dg8wsxbb',
      '/admin/trading-management',
    ];
    for (const path of paths) {
      for (const crumb of buildBreadcrumbs(path)) {
        expect(crumb.label).toMatch(PERSIAN);
      }
    }
  });

  it('falls back to a Persian label for an unknown static segment', () => {
    expect(breadcrumbLabel('something-new', '/dashboard/something-new')).toBe('جزئیات');
  });
});
