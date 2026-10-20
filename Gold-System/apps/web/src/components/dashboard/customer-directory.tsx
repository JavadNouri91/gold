'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  AlertTriangle,
  Columns3,
  Copy,
  Crown,
  Download,
  Eye,
  FileSpreadsheet,
  MoreHorizontal,
  ShieldAlert,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { internalCustomersApi, type StaffCustomer } from '@/lib/internal-api';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/dashboard/page-header';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { RegisterCustomerButton } from '@/components/dashboard/register-customer-form';
import { ForbiddenNotice } from '@/components/dashboard/permission-gate';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import {
  CustomerEditDialog,
  CustomerImportDialog,
  Toast,
  TypeBadge,
  accountStatusOf,
  balanceTone,
  displayedStatus,
} from '@/components/dashboard/customer-widgets';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MobileNumber } from '@/components/ui/mobile-input';
import { Modal } from '@/components/ui/modal';
import { ApiClientError } from '@/lib/api';
import {
  CUSTOMER_ACCOUNT_STATUS_LABELS,
  CUSTOMER_FINANCIAL_LABELS,
  CUSTOMER_SEGMENT_LABELS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_VERIFICATION_LABELS,
  cn,
  formatDate,
  formatFaNumber,
  formatMoney,
  formatWeight,
  latinMobile,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/utils';

const COLUMN_KEY = 'gold.customers.columns';
const ALL_COLUMNS = [
  'number',
  'customer',
  'mobile',
  'lastPurchase',
  'verification',
  'balance',
  'gold',
  'orders',
  'status',
  'actions',
] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

const DEFAULT_COLUMNS: ColumnKey[] = [
  'number',
  'customer',
  'mobile',
  'lastPurchase',
  'verification',
  'balance',
  'gold',
  'status',
  'actions',
];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: 'شناسه مشتری',
  customer: 'نام مشتری',
  mobile: 'اطلاعات تماس',
  lastPurchase: 'آخرین خرید',
  verification: 'وضعیت احراز هویت',
  balance: 'مانده حساب ریالی',
  gold: 'دارایی طلای آبشده',
  orders: 'تعداد سفارش',
  status: 'وضعیت حساب',
  actions: 'عملیات',
};

const VERIFICATION_LABELS: Record<string, string> = {
  ...CUSTOMER_VERIFICATION_LABELS,
  REJECTED: 'مدارک ناقص',
};

interface Filters {
  search: string;
  type: string;
  accountStatus: string;
  segment: string;
  financialStatus: string;
  verificationStatus: string;
  page: number;
  limit: number;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  type: '',
  accountStatus: '',
  segment: '',
  financialStatus: '',
  verificationStatus: '',
  page: 1,
  limit: 10,
};

function parseFilters(params: URLSearchParams): Filters {
  const limit = Number(params.get('limit') ?? '10');
  const page = Number(params.get('page') ?? '1');
  return {
    search: params.get('search') ?? '',
    type: params.get('type') ?? '',
    accountStatus: params.get('accountStatus') ?? '',
    segment: params.get('segment') ?? '',
    financialStatus: params.get('financialStatus') ?? '',
    verificationStatus: params.get('verificationStatus') ?? '',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: [10, 20, 50].includes(limit) ? limit : 10,
  };
}

function writeFilters(filters: Filters): string {
  const query = new URLSearchParams();
  const entries: Array<[string, string]> = [
    ['search', filters.search],
    ['type', filters.type],
    ['accountStatus', filters.accountStatus],
    ['segment', filters.segment],
    ['financialStatus', filters.financialStatus],
    ['verificationStatus', filters.verificationStatus],
  ];
  for (const [key, value] of entries) {
    if (value) query.set(key, value);
  }
  if (filters.page > 1) query.set('page', String(filters.page));
  if (filters.limit !== 10) query.set('limit', String(filters.limit));
  const text = query.toString();
  return text ? `/dashboard/customers?${text}` : '/dashboard/customers';
}

function queryFromFilters(filters: Filters) {
  return {
    search: filters.search ? toLatinDigits(filters.search) : undefined,
    type: filters.type || undefined,
    accountStatus: filters.accountStatus || undefined,
    segment: filters.segment || undefined,
    financialStatus: filters.financialStatus || undefined,
    verificationStatus: filters.verificationStatus || undefined,
    page: filters.page,
    limit: filters.limit,
  };
}

function options(map: Record<string, string>) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

function sanitizeColumns(keys: string[]): ColumnKey[] {
  const allowed = new Set<string>(ALL_COLUMNS);
  const filtered = keys.filter((key): key is ColumnKey => allowed.has(key));
  return filtered.length ? ALL_COLUMNS.filter((key) => filtered.includes(key)) : [...DEFAULT_COLUMNS];
}

function SelectFilter({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  const active = Boolean(value);
  return (
    <label className="min-w-[8.5rem] flex-1 space-y-1 text-sm">
      <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
        {label}
        {active ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-500 px-1.5 text-[10px] font-bold text-white">
            ۱
          </span>
        ) : null}
      </span>
      <select
        className={cn(
          'h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500',
          active ? 'border-gold-400' : 'border-input',
        )}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">همه</option>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function VerificationBadge({ status }: { status?: string }) {
  const code = status ?? 'UNVERIFIED';
  const label = VERIFICATION_LABELS[code] ?? CUSTOMER_VERIFICATION_LABELS[code] ?? code;
  const variant =
    code === 'VERIFIED' ? 'green' : code === 'PENDING_REVIEW' ? 'yellow' : code === 'REJECTED' ? 'red' : 'gray';
  return <Badge variant={variant}>{label}</Badge>;
}

function BalanceCell({ value }: { value: string | null | undefined }) {
  const tone = balanceTone(value);
  if (tone === 'hidden') return <span className="text-muted-foreground">—</span>;
  const formatted = formatMoney(value);
  if (tone === 'neg') {
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
        {formatted}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'font-semibold tabular-nums',
        tone === 'pos' ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
      )}
    >
      {formatted}
    </span>
  );
}

function CopyMobileButton({ mobile }: { mobile: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      title={copied ? 'کپی شد' : 'کپی شماره'}
      aria-label={copied ? 'کپی شد' : 'کپی شماره موبایل'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(latinMobile(mobile));
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore clipboard failures */
        }
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

export function CustomerDirectory() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const applied = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [draft, setDraft] = useState(applied);
  const [visible, setVisible] = useState<ColumnKey[]>([...DEFAULT_COLUMNS]);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffCustomer | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ customer: StaffCustomer; next: string } | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkBlockOpen, setBulkBlockOpen] = useState(false);
  const [bulkTypeOpen, setBulkTypeOpen] = useState(false);
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false);
  const [bulkType, setBulkType] = useState('HOUSEHOLD');
  const [bulkSmsBody, setBulkSmsBody] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const allowed = hasPermission(user?.permissions, 'customer.read');
  const canFinance = hasPermission(user?.permissions, 'customer.account.read');
  const canManage = hasPermission(user?.permissions, 'customer.group.assign');

  const [searchText, setSearchText] = useState(applied.search);
  const appliedRef = useRef(applied);
  appliedRef.current = applied;
  const pushedSearch = useRef(applied.search);
  const searchTimer = useRef<number | null>(null);
  const filterKey = [
    applied.type,
    applied.accountStatus,
    applied.segment,
    applied.financialStatus,
    applied.verificationStatus,
  ].join('\0');

  useEffect(() => {
    setDraft(appliedRef.current);
  }, [filterKey]);

  useEffect(() => {
    if (applied.search === pushedSearch.current) return;
    pushedSearch.current = applied.search;
    setSearchText(applied.search);
  }, [applied.search]);

  useEffect(() => {
    const next = searchText.trim();
    if (next === appliedRef.current.search.trim()) return;
    searchTimer.current = window.setTimeout(() => {
      searchTimer.current = null;
      const current = appliedRef.current;
      if (next === current.search.trim()) return;
      pushedSearch.current = next;
      setSelected([]);
      router.replace(writeFilters({ ...current, search: next, page: 1 }));
    }, 300);
    return () => {
      if (searchTimer.current != null) {
        window.clearTimeout(searchTimer.current);
        searchTimer.current = null;
      }
    };
  }, [searchText, router]);

  useEffect(() => {
    const saved = window.localStorage.getItem(COLUMN_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as string[];
      if (Array.isArray(parsed) && parsed.length) setVisible(sanitizeColumns(parsed));
    } catch {
      window.localStorage.removeItem(COLUMN_KEY);
    }
  }, []);

  const listKey = allowed ? ['customers', applied] : null;
  const list = useSWR(listKey, () => internalCustomersApi.list(queryFromFilters(applied)), {
    keepPreviousData: true,
  });
  const summary = useSWR(allowed ? 'customers-summary' : null, () =>
    typeof internalCustomersApi.summary === 'function'
      ? internalCustomersApi.summary()
      : Promise.resolve(null),
  );

  const go = (next: Filters) => {
    if (searchTimer.current != null) {
      window.clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
    const search = next.search.trim();
    const resolved = { ...next, search };
    appliedRef.current = resolved;
    pushedSearch.current = search;
    setDraft(resolved);
    setSearchText(search);
    setSelected([]);
    router.replace(writeFilters(resolved));
  };

  const applySelect = (patch: Partial<Filters>) => {
    go({ ...appliedRef.current, ...patch, search: searchText, page: 1 });
  };

  const rows = list.data?.items ?? [];
  const pageIds = rows.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));
  const someSelected = pageIds.some((id) => selected.includes(id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  if (!allowed) return <ForbiddenNotice permission="customer.read" />;

  const toggleColumn = (key: ColumnKey) => {
    setVisible((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      const ordered = sanitizeColumns(next);
      window.localStorage.setItem(COLUMN_KEY, JSON.stringify(ordered));
      return ordered.length ? ordered : ['customer'];
    });
  };

  const showBalance = visible.includes('balance') && canFinance;
  const showGold = visible.includes('gold');

  const columns: Column<StaffCustomer>[] = [
    {
      key: 'select',
      header: (
        <input
          ref={selectAllRef}
          type="checkbox"
          aria-label="انتخاب همه مشتریان این صفحه"
          checked={allSelected}
          onChange={() => setSelected(allSelected ? [] : pageIds)}
        />
      ),
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`انتخاب ${row.fullName}`}
          checked={selected.includes(row.id)}
          onChange={() =>
            setSelected((current) =>
              current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
            )
          }
        />
      ),
    },
  ];

  if (visible.includes('number')) {
    columns.push({
      key: 'number',
      header: 'شناسه',
      render: (row) => (
        <Link className="font-medium text-gold-800 dark:text-gold-400" href={`/dashboard/customers/${row.id}`} dir="ltr">
          #{toPersianDigits(row.customerNumber)}
        </Link>
      ),
    });
  }
  if (visible.includes('customer')) {
    columns.push({
      key: 'customer',
      header: 'نام مشتری',
      render: (row) => (
        <Link href={`/dashboard/customers/${row.id}`} className="flex items-center gap-2 font-medium">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs text-gold-800 dark:bg-gold-900/40 dark:text-gold-300">
            {(row.firstName || row.fullName).slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate">{row.fullName || `${row.firstName} ${row.lastName}`}</span>
            <span className="mt-0.5 block">
              <TypeBadge type={row.type} />
            </span>
          </span>
        </Link>
      ),
    });
  }
  if (visible.includes('mobile')) {
    columns.push({
      key: 'mobile',
      header: 'اطلاعات تماس',
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          <MobileNumber value={row.mobile} />
          {row.mobile ? <CopyMobileButton mobile={row.mobile} /> : null}
        </span>
      ),
    });
  }
  if (visible.includes('lastPurchase')) {
    columns.push({
      key: 'lastPurchase',
      header: 'آخرین خرید',
      render: (row) => formatDate(row.lastPurchaseAt),
    });
  }
  if (visible.includes('verification')) {
    columns.push({
      key: 'verification',
      header: 'احراز هویت',
      render: (row) => <VerificationBadge status={row.verificationStatus} />,
    });
  }
  if (visible.includes('orders')) {
    columns.push({
      key: 'orders',
      header: 'تعداد سفارش',
      render: (row) => formatFaNumber(row.orderCount ?? 0),
    });
  }
  if (showBalance) {
    columns.push({
      key: 'balance',
      header: 'مانده ریالی',
      render: (row) => <BalanceCell value={row.balanceRial} />,
    });
  }
  if (showGold) {
    columns.push({
      key: 'gold',
      header: 'موجودی طلا',
      render: (row) => (
        <span className="tabular-nums">{formatWeight(row.totalWeightGrams ?? '0')}</span>
      ),
    });
  }
  if (visible.includes('status')) {
    columns.push({
      key: 'status',
      header: 'وضعیت حساب',
      render: (row) => {
        const status = displayedStatus(row);
        const variant = status.code === 'ACTIVE' ? 'green' : status.code === 'BLOCKED' ? 'red' : 'gray';
        return <Badge variant={variant}>{status.label}</Badge>;
      },
    });
  }
  if (visible.includes('actions')) {
    columns.push({
      key: 'actions',
      header: 'عملیات',
      render: (row) => (
        <div className="relative flex items-center gap-1">
          <Link
            href={`/dashboard/customers/${row.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            title="مشاهده پرونده"
          >
            <Eye className="h-3.5 w-3.5" />
            مشاهده پرونده
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-haspopup="menu"
            aria-expanded={menuId === row.id}
            aria-label={`عملیات ${row.fullName}`}
            onClick={() => setMenuId((current) => (current === row.id ? null : row.id))}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuId === row.id ? (
            <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border bg-background p-1 shadow-lg">
              {canManage ? (
                <MenuButton
                  onClick={() => {
                    setEditing(row);
                    setMenuId(null);
                  }}
                >
                  ویرایش
                </MenuButton>
              ) : null}
              <MenuLink href={`/dashboard/customers/${row.id}?tab=account`}>لاگ تراکنش‌ها</MenuLink>
              <MenuLink href={`/dashboard/orders?customerId=${row.id}`}>ثبت سفارش</MenuLink>
              <MenuLink href={`/dashboard/payments?customerId=${row.id}`}>ثبت پرداخت</MenuLink>
              {canManage && accountStatusOf(row) !== 'BLOCKED' ? (
                <MenuButton
                  onClick={() => {
                    setStatusTarget({ customer: row, next: 'BLOCKED' });
                    setMenuId(null);
                  }}
                >
                  مسدودسازی
                </MenuButton>
              ) : null}
              {canManage && accountStatusOf(row) !== 'INACTIVE' ? (
                <MenuButton
                  onClick={() => {
                    setStatusTarget({ customer: row, next: 'INACTIVE' });
                    setMenuId(null);
                  }}
                >
                  غیرفعال کردن
                </MenuButton>
              ) : null}
              {canManage && accountStatusOf(row) !== 'ACTIVE' ? (
                <MenuButton
                  onClick={() => {
                    setStatusTarget({ customer: row, next: 'ACTIVE' });
                    setMenuId(null);
                  }}
                >
                  فعال کردن
                </MenuButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    });
  }

  const cards = [
    {
      key: 'total',
      label: 'کل مشتریان',
      value: summary.data?.total,
      unit: 'کاربر',
      hint:
        summary.data?.newCustomers != null
          ? `+${formatFaNumber(summary.data.newCustomers)} کاربر جدید`
          : '۳۰ روز اخیر',
      icon: Users,
      className: 'bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40',
      href: writeFilters(EMPTY_FILTERS),
    },
    {
      key: 'active',
      label: 'کاربران فعال',
      value: summary.data?.active,
      unit: 'حساب',
      hint: 'وضعیت حساب فعال',
      icon: UserRound,
      className: 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40',
      href: writeFilters({ ...EMPTY_FILTERS, accountStatus: 'ACTIVE' }),
    },
    {
      key: 'kyc',
      label: 'در انتظار احراز هویت',
      value: summary.data?.pendingVerification,
      unit: 'پرونده',
      hint: 'نیازمند بررسی مدارک',
      icon: ShieldAlert,
      className: 'bg-orange-50 border-orange-100 dark:bg-orange-950/30 dark:border-orange-900/40',
      href: '/dashboard/kyc',
    },
    {
      key: 'vip',
      label: 'مشتریان VIP',
      value: summary.data?.vip,
      unit: 'کاربر',
      hint: 'سطح بالا',
      icon: Crown,
      className: 'bg-sky-50 border-sky-100 dark:bg-sky-950/30 dark:border-sky-900/40',
      href: writeFilters({ ...EMPTY_FILTERS, type: 'VIP' }),
    },
    {
      key: 'debtors',
      label: 'مانده بدهکاران',
      value: canFinance ? summary.data?.debtors : null,
      unit: 'کاربر',
      hint: canFinance
        ? summary.data?.debtorsBalanceRial
          ? `مجموع بدهی: ${formatMoney(summary.data.debtorsBalanceRial)}`
          : 'مانده منفی'
        : 'نیاز به مجوز حساب',
      icon: Wallet,
      className: 'bg-rose-50 border-rose-100 dark:bg-rose-950/40 dark:border-rose-900/40',
      href: canFinance ? writeFilters({ ...EMPTY_FILTERS, financialStatus: 'DEBTOR' }) : undefined,
      warn: true,
    },
  ];

  const exportFile = async () => {
    try {
      const result = await internalCustomersApi.exportCsv(queryFromFilters({ ...applied, page: 1 }));
      const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'customers.csv';
      anchor.click();
      URL.revokeObjectURL(url);
      setToast('فایل خروجی آماده شد.');
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : 'خروجی اکسل انجام نشد.');
    }
  };

  const runBulkBlock = async (reason: string) => {
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        selected.map((id) => internalCustomersApi.setAccountStatus(id, 'BLOCKED', reason)),
      );
      const ok = results.filter((row) => row.status === 'fulfilled').length;
      const fail = results.length - ok;
      setToast(`مسدودسازی: ${formatFaNumber(ok)} موفق، ${formatFaNumber(fail)} ناموفق`);
      setSelected([]);
      setBulkBlockOpen(false);
      void list.mutate();
      void summary.mutate();
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkType = async () => {
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(
        selected.map((id) =>
          internalCustomersApi.assignType(id, bulkType, 'تغییر گروهی نوع مشتری از فهرست'),
        ),
      );
      const ok = results.filter((row) => row.status === 'fulfilled').length;
      const fail = results.length - ok;
      setToast(`تغییر گروه: ${formatFaNumber(ok)} موفق، ${formatFaNumber(fail)} ناموفق`);
      setSelected([]);
      setBulkTypeOpen(false);
      void list.mutate();
      void summary.mutate();
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkSms = async () => {
    const body = bulkSmsBody.trim();
    if (body.length < 5) {
      setNotice('متن پیامک باید حداقل ۵ کاراکتر باشد.');
      return;
    }
    setBulkBusy(true);
    try {
      const result = await internalCustomersApi.sendBulkSms(selected, body);
      setToast(
        `پیامک: ${formatFaNumber(result.sent)} ارسال شد، ${formatFaNumber(result.failed)} ناموفق`,
      );
      setSelected([]);
      setBulkSmsOpen(false);
      setBulkSmsBody('');
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : 'ارسال پیامک گروهی انجام نشد.');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      <nav aria-label="مسیر" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          داشبورد
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">مشتریان</span>
      </nav>
      <PageHeader
        title="مدیریت مشتریان"
        description="مدیریت مشتریان، سوابق خرید، سفارش‌ها و وضعیت حساب"
        actions={
          <>
            <RegisterCustomerButton
              onCreated={(customer) => {
                setNotice(`${customer.fullName} با شماره ${toPersianDigits(customer.customerNumber)} ثبت شد.`);
                setToast('مشتری جدید ثبت شد.');
                void list.mutate();
                void summary.mutate();
              }}
            />
            {canManage ? (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet className="me-2 h-4 w-4" />
                ورودی Excel
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => void exportFile()}>
              <Download className="me-2 h-4 w-4" />
              خروجی Excel
            </Button>
            <Button variant="outline" onClick={() => setColumnsOpen(true)}>
              <Columns3 className="me-2 h-4 w-4" />
              تنظیم ستون‌ها
            </Button>
          </>
        }
      />

      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          const inner = (
            <div className={cn('rounded-xl border p-4 h-full', card.className)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    {card.label}
                    {card.warn ? <AlertTriangle className="h-3.5 w-3.5 text-rose-600" aria-hidden /> : null}
                  </p>
                  {summary.isLoading ? (
                    <SkeletonBlock className="mt-3 h-8 w-16" />
                  ) : (
                    <p className="mt-2 text-2xl font-bold tabular-nums">
                      {card.value == null ? '—' : (
                        <>
                          {formatFaNumber(card.value)}{' '}
                          <span className="text-sm font-medium text-muted-foreground">{card.unit}</span>
                        </>
                      )}
                    </p>
                  )}
                  <p className={cn('mt-1 text-xs', card.warn && canFinance ? 'font-medium text-rose-700 dark:text-rose-300' : 'text-muted-foreground')}>
                    {card.hint}
                  </p>
                </div>
                <Icon className="h-5 w-5 text-gold-700 dark:text-gold-400" aria-hidden="true" />
              </div>
            </div>
          );
          if (!card.href) return <div key={card.key}>{inner}</div>;
          return (
            <Link
              key={card.key}
              href={card.href}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="rounded-xl border bg-background p-4">
        <div className="flex items-end gap-2 overflow-x-auto">
          <div className="min-w-[12rem] flex-[1.4]">
            <Input
              label="جستجو"
              placeholder="نام، موبایل، کد ملی یا کد مشتری"
              value={toPersianDigits(searchText)}
              hint={
                searchText.trim() !== applied.search.trim() || (list.isValidating && Boolean(applied.search.trim()))
                  ? 'در حال جستجو…'
                  : undefined
              }
              onChange={(event) => setSearchText(toLatinDigits(event.target.value))}
            />
          </div>
          <SelectFilter
            label="نوع مشتری"
            value={draft.type}
            onChange={(type) => applySelect({ type })}
            items={options(CUSTOMER_TYPE_LABELS)}
          />
          <SelectFilter
            label="وضعیت حساب"
            value={draft.accountStatus}
            onChange={(accountStatus) => applySelect({ accountStatus })}
            items={options(CUSTOMER_ACCOUNT_STATUS_LABELS).filter((item) => item.value !== 'DEBTOR')}
          />
          <SelectFilter
            label="سطح مشتری"
            value={draft.segment}
            onChange={(segment) => applySelect({ segment })}
            items={options(CUSTOMER_SEGMENT_LABELS)}
          />
          {canFinance ? (
            <SelectFilter
              label="وضعیت مالی"
              value={draft.financialStatus}
              onChange={(financialStatus) => applySelect({ financialStatus })}
              items={options(CUSTOMER_FINANCIAL_LABELS)}
            />
          ) : null}
          <SelectFilter
            label="وضعیت احراز هویت"
            value={draft.verificationStatus}
            onChange={(verificationStatus) => applySelect({ verificationStatus })}
            items={options(CUSTOMER_VERIFICATION_LABELS)}
          />
          <Button type="button" variant="outline" className="shrink-0" onClick={() => go(EMPTY_FILTERS)}>
            حذف فیلترها
          </Button>
        </div>
      </div>

      {list.error ? <ApiErrorState error={list.error} onRetry={() => void list.mutate()} /> : null}
      {summary.error ? <ApiErrorState error={summary.error} onRetry={() => void summary.mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={list.isLoading && !list.data}
        caption="فهرست مشتریان"
        stickyHeader
        density="compact"
        page={list.data?.meta.page ?? applied.page}
        totalPages={list.data?.meta.totalPages ?? 1}
        total={list.data?.meta.total}
        pageSize={applied.limit}
        onPageChange={(page) => go({ ...applied, page })}
        onPageSizeChange={(limit) => go({ ...applied, limit, page: 1 })}
        emptyMessage="مشتری‌ای با این فیلتر پیدا نشد"
      />

      {selected.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(96vw,52rem)] -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm font-medium">
            {formatFaNumber(selected.length)} مشتری انتخاب شده
          </p>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <>
                <Button size="sm" variant="outline" onClick={() => setBulkSmsOpen(true)}>
                  ارسال پیامک گروهی
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkTypeOpen(true)}>
                  تغییر گروه مشتری
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBulkBlockOpen(true)}>
                  مسدودسازی
                </Button>
              </>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              لغو انتخاب
            </Button>
          </div>
        </div>
      ) : null}

      <CustomerEditDialog
        customer={editing}
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onSaved={(message) => {
          setToast(message);
          void list.mutate();
        }}
      />
      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={
          statusTarget
            ? `تغییر وضعیت به ${CUSTOMER_ACCOUNT_STATUS_LABELS[statusTarget.next] ?? statusTarget.next}`
            : 'تغییر وضعیت'
        }
        message="این تغییر روی امکان معامله مشتری اثر می‌گذارد و در گزارش حسابرسی ثبت می‌شود."
        confirmLabel="ثبت وضعیت"
        destructive={statusTarget?.next !== 'ACTIVE'}
        requireReason
        onClose={() => setStatusTarget(null)}
        onConfirm={(reason) => {
          if (!statusTarget || !reason) return;
          void internalCustomersApi
            .setAccountStatus(statusTarget.customer.id, statusTarget.next, reason)
            .then(() => {
              setToast('وضعیت حساب مشتری به‌روز شد.');
              setStatusTarget(null);
              void list.mutate();
              void summary.mutate();
            })
            .catch((err: unknown) => {
              setNotice(err instanceof ApiClientError ? err.message : 'تغییر وضعیت انجام نشد.');
              setStatusTarget(null);
            });
        }}
      />
      <ConfirmDialog
        open={bulkBlockOpen}
        title="مسدودسازی گروهی"
        message={`${formatFaNumber(selected.length)} مشتری انتخاب‌شده مسدود می‌شوند. این تغییر در حسابرسی ثبت می‌شود.`}
        confirmLabel="مسدود کردن"
        destructive
        requireReason
        onClose={() => setBulkBlockOpen(false)}
        onConfirm={(reason) => {
          if (!reason || bulkBusy) return;
          void runBulkBlock(reason);
        }}
      />
      <Modal open={bulkTypeOpen} onClose={() => setBulkTypeOpen(false)} title="تغییر گروه مشتری">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            نوع {formatFaNumber(selected.length)} مشتری انتخاب‌شده را تغییر دهید.
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">نوع مشتری</span>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={bulkType}
              onChange={(event) => setBulkType(event.target.value)}
            >
              {Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkTypeOpen(false)}>
              انصراف
            </Button>
            <Button isLoading={bulkBusy} onClick={() => void runBulkType()}>
              اعمال
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={bulkSmsOpen} onClose={() => setBulkSmsOpen(false)} title="ارسال پیامک گروهی">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            پیامک برای {formatFaNumber(selected.length)} مشتری ارسال می‌شود (حداکثر ۵۰ نفر).
          </p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">متن پیامک</span>
            <textarea
              className="min-h-[100px] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              value={bulkSmsBody}
              maxLength={500}
              onChange={(event) => setBulkSmsBody(event.target.value)}
              placeholder="متن پیام را وارد کنید…"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBulkSmsOpen(false)}>
              انصراف
            </Button>
            <Button isLoading={bulkBusy} onClick={() => void runBulkSms()}>
              ارسال
            </Button>
          </div>
        </div>
      </Modal>
      <Modal open={columnsOpen} onClose={() => setColumnsOpen(false)} title="تنظیم ستون‌ها">
        <div className="space-y-2">
          {ALL_COLUMNS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visible.includes(key)} onChange={() => toggleColumn(key)} />
              {COLUMN_LABELS[key]}
            </label>
          ))}
        </div>
      </Modal>
      <CustomerImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(message) => {
          setToast(message);
          setImportOpen(false);
        }}
        onFinished={() => {
          void list.mutate();
          void summary.mutate();
        }}
      />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      role="menuitem"
      href={href}
      className="block rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
    >
      {children}
    </Link>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="menuitem"
      type="button"
      className="block w-full rounded-md px-3 py-2 text-right text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
