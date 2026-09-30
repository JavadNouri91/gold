'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import {
  Columns3,
  Download,
  FileSpreadsheet,
  MoreHorizontal,
  Crown,
  UserPlus,
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
  formatDate,
  formatMoney,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/utils';

const COLUMN_KEY = 'gold.customers.columns';
const ALL_COLUMNS = ['number', 'customer', 'mobile', 'type', 'lastPurchase', 'orders', 'balance', 'status', 'actions'] as const;
type ColumnKey = (typeof ALL_COLUMNS)[number];

const COLUMN_LABELS: Record<ColumnKey, string> = {
  number: 'کد مشتری',
  customer: 'مشتری',
  mobile: 'موبایل',
  type: 'نوع',
  lastPurchase: 'آخرین خرید',
  orders: 'تعداد سفارش',
  balance: 'مانده حساب (ریال)',
  status: 'وضعیت',
  actions: 'عملیات',
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
  more: boolean;
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
  more: false,
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
    more: params.get('more') === '1',
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
  if (filters.more) query.set('more', '1');
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
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
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

export function CustomerDirectory() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const applied = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [draft, setDraft] = useState(applied);
  const [more, setMore] = useState(applied.more);
  const [visible, setVisible] = useState<ColumnKey[]>([...ALL_COLUMNS]);
  const [selected, setSelected] = useState<string[]>([]);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffCustomer | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ customer: StaffCustomer; next: string } | null>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    applied.more,
  ].join('\0');

  useEffect(() => {
    setDraft(appliedRef.current);
    setMore(appliedRef.current.more);
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
      const parsed = JSON.parse(saved) as ColumnKey[];
      if (Array.isArray(parsed) && parsed.length) setVisible(parsed);
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
    pushedSearch.current = search;
    setSearchText(search);
    setSelected([]);
    router.replace(writeFilters({ ...next, search }));
  };

  if (!allowed) return <ForbiddenNotice permission="customer.read" />;

  const rows = list.data?.items ?? [];
  const pageIds = rows.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  const toggleColumn = (key: ColumnKey) => {
    setVisible((current) => {
      const next = current.includes(key) ? current.filter((item) => item !== key) : [...current, key];
      const ordered = ALL_COLUMNS.filter((item) => next.includes(item));
      window.localStorage.setItem(COLUMN_KEY, JSON.stringify(ordered));
      return ordered.length ? ordered : ['customer'];
    });
  };

  const show = (key: ColumnKey) => visible.includes(key) && (key !== 'balance' || canFinance);

  const columns: Column<StaffCustomer>[] = [
    {
      key: 'select',
      header: (
        <input
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

  if (show('number')) {
    columns.push({
      key: 'number',
      header: 'کد مشتری',
      render: (row) => (
        <Link className="font-medium text-gold-800" href={`/dashboard/customers/${row.id}`} dir="ltr">
          {row.customerNumber}
        </Link>
      ),
    });
  }
  if (show('customer')) {
    columns.push({
      key: 'customer',
      header: 'مشتری',
      render: (row) => (
        <Link href={`/dashboard/customers/${row.id}`} className="flex items-center gap-2 font-medium">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-xs text-gold-800">
            {(row.firstName || row.fullName).slice(0, 1)}
          </span>
          {row.fullName || `${row.firstName} ${row.lastName}`}
        </Link>
      ),
    });
  }
  if (show('mobile')) {
    columns.push({
      key: 'mobile',
      header: 'موبایل',
      render: (row) => <MobileNumber value={row.mobile} />,
    });
  }
  if (show('type')) {
    columns.push({ key: 'type', header: 'نوع', render: (row) => <TypeBadge type={row.type} /> });
  }
  if (show('lastPurchase')) {
    columns.push({
      key: 'lastPurchase',
      header: 'آخرین خرید',
      render: (row) => formatDate(row.lastPurchaseAt),
    });
  }
  if (show('orders')) {
    columns.push({
      key: 'orders',
      header: 'تعداد سفارش',
      render: (row) => (row.orderCount ?? 0).toLocaleString('fa-IR'),
    });
  }
  if (show('balance')) {
    columns.push({
      key: 'balance',
      header: 'مانده حساب (ریال)',
      render: (row) => {
        const tone = balanceTone(row.balanceRial);
        const color = tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-700' : 'text-muted-foreground';
        return <span className={`font-medium tabular-nums ${color}`}>{formatMoney(row.balanceRial)}</span>;
      },
    });
  }
  if (show('status')) {
    columns.push({
      key: 'status',
      header: 'وضعیت',
      render: (row) => {
        const status = displayedStatus(row);
        const variant = status.code === 'ACTIVE' ? 'green' : status.code === 'DEBTOR' || status.code === 'BLOCKED' ? 'red' : 'gray';
        return <Badge variant={variant}>{status.label}</Badge>;
      },
    });
  }
  if (show('actions')) {
    columns.push({
      key: 'actions',
      header: 'عملیات',
      render: (row) => (
        <div className="relative">
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
            <div role="menu" className="absolute left-0 z-20 mt-1 w-48 rounded-lg border bg-white p-1 shadow-lg">
              <MenuLink href={`/dashboard/customers/${row.id}`}>مشاهده مشتری</MenuLink>
              {canManage ? <MenuButton onClick={() => { setEditing(row); setMenuId(null); }}>ویرایش</MenuButton> : null}
              <MenuLink href={`/dashboard/orders?customerId=${row.id}`}>ثبت سفارش</MenuLink>
              <MenuLink href={`/dashboard/customers/${row.id}?tab=quotations`}>صدور پیش‌فاکتور</MenuLink>
              <MenuLink href={`/dashboard/payments?customerId=${row.id}`}>ثبت پرداخت</MenuLink>
              <MenuLink href={`/dashboard/customers/${row.id}?tab=account`}>مشاهده حساب مالی</MenuLink>
              {canManage && accountStatusOfLocal(row) !== 'INACTIVE' ? (
                <MenuButton onClick={() => { setStatusTarget({ customer: row, next: 'INACTIVE' }); setMenuId(null); }}>
                  غیرفعال کردن
                </MenuButton>
              ) : null}
              {canManage && accountStatusOfLocal(row) !== 'ACTIVE' ? (
                <MenuButton onClick={() => { setStatusTarget({ customer: row, next: 'ACTIVE' }); setMenuId(null); }}>
                  فعال کردن
                </MenuButton>
              ) : null}
              {canManage && accountStatusOfLocal(row) !== 'BLOCKED' ? (
                <MenuButton onClick={() => { setStatusTarget({ customer: row, next: 'BLOCKED' }); setMenuId(null); }}>
                  مسدود کردن
                </MenuButton>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    });
  }

  const cards = [
    { label: 'مشتریان کل', value: summary.data?.total, hint: 'همه مشتریان', icon: Users, className: 'bg-amber-50 border-amber-100' },
    { label: 'مشتریان فعال', value: summary.data?.active, hint: 'وضعیت حساب فعال', icon: UserRound, className: 'bg-emerald-50 border-emerald-100' },
    { label: 'VIP', value: summary.data?.vip, hint: 'نوع مشتری VIP', icon: Crown, className: 'bg-violet-50 border-violet-100' },
    { label: 'بدهکاران', value: canFinance ? summary.data?.debtors : null, hint: canFinance ? 'مانده منفی' : 'نیاز به مجوز حساب', icon: Wallet, className: 'bg-rose-50 border-rose-100' },
    { label: 'مشتریان جدید', value: summary.data?.newCustomers, hint: '۳۰ روز اخیر', icon: UserPlus, className: 'bg-sky-50 border-sky-100' },
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

  return (
    <div className="space-y-5">
      <nav aria-label="مسیر" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">داشبورد</Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">مشتریان</span>
      </nav>
      <PageHeader
        title="مشتریان"
        description="مدیریت مشتریان، سوابق خرید، سفارش‌ها و وضعیت حساب"
        actions={
          <>
            <RegisterCustomerButton
              onCreated={(customer) => {
                setNotice(`${customer.fullName} با شماره ${customer.customerNumber} ثبت شد.`);
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
              تنظیمات ستون‌ها
            </Button>
          </>
        }
      />

      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`rounded-xl border p-4 ${card.className}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  {summary.isLoading ? (
                    <SkeletonBlock className="mt-3 h-8 w-16" />
                  ) : (
                    <p className="mt-2 text-2xl font-bold tabular-nums">
                      {card.value == null ? '—' : card.value.toLocaleString('fa-IR')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </div>
                <Icon className="h-5 w-5 text-gold-700" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      <form
        className="space-y-3 rounded-xl border bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          go({ ...draft, search: searchText, more, page: 1, limit: applied.limit });
        }}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
          <SelectFilter label="نوع مشتری" value={draft.type} onChange={(type) => setDraft({ ...draft, type })} items={options(CUSTOMER_TYPE_LABELS)} />
          <SelectFilter label="وضعیت مشتری" value={draft.accountStatus} onChange={(accountStatus) => setDraft({ ...draft, accountStatus })} items={options(CUSTOMER_ACCOUNT_STATUS_LABELS).filter((item) => item.value !== 'DEBTOR')} />
          <SelectFilter label="سطح مشتری" value={draft.segment} onChange={(segment) => setDraft({ ...draft, segment })} items={options(CUSTOMER_SEGMENT_LABELS)} />
          {canFinance ? (
            <SelectFilter label="وضعیت مالی" value={draft.financialStatus} onChange={(financialStatus) => setDraft({ ...draft, financialStatus })} items={options(CUSTOMER_FINANCIAL_LABELS)} />
          ) : null}
        </div>
        {more ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <SelectFilter
              label="وضعیت احراز"
              value={draft.verificationStatus}
              onChange={(verificationStatus) => setDraft({ ...draft, verificationStatus })}
              items={options(CUSTOMER_VERIFICATION_LABELS)}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setMore((current) => !current)}>
            فیلترهای بیشتر
          </Button>
          <Button type="submit">اعمال فیلتر</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setMore(false);
              setSearchText('');
              go(EMPTY_FILTERS);
            }}
          >
            پاک کردن
          </Button>
        </div>
      </form>

      {selected.length ? (
        <p className="text-sm text-muted-foreground">{selected.length.toLocaleString('fa-IR')} مشتری در این صفحه انتخاب شده است.</p>
      ) : null}
      {list.error ? <ApiErrorState error={list.error} onRetry={() => void list.mutate()} /> : null}
      {summary.error ? <ApiErrorState error={summary.error} onRetry={() => void summary.mutate()} /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        isLoading={list.isLoading && !list.data}
        caption="فهرست مشتریان"
        stickyHeader
        page={list.data?.meta.page ?? applied.page}
        totalPages={list.data?.meta.totalPages ?? 1}
        total={list.data?.meta.total}
        pageSize={applied.limit}
        onPageChange={(page) => go({ ...applied, page })}
        onPageSizeChange={(limit) => go({ ...applied, limit, page: 1 })}
        emptyMessage="مشتری‌ای با این فیلتر پیدا نشد"
      />

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
        title={statusTarget ? `تغییر وضعیت به ${CUSTOMER_ACCOUNT_STATUS_LABELS[statusTarget.next] ?? statusTarget.next}` : 'تغییر وضعیت'}
        message="این تغییر روی امکان معامله مشتری اثر می‌گذارد و در گزارش حسابرسی ثبت می‌شود."
        confirmLabel="ثبت وضعیت"
        destructive={statusTarget?.next !== 'ACTIVE'}
        requireReason
        onClose={() => setStatusTarget(null)}
        onConfirm={(reason) => {
          if (!statusTarget || !reason) return;
          void internalCustomersApi.setAccountStatus(statusTarget.customer.id, statusTarget.next, reason).then(() => {
            setToast('وضعیت حساب مشتری به‌روز شد.');
            setStatusTarget(null);
            void list.mutate();
            void summary.mutate();
          }).catch((err: unknown) => {
            setNotice(err instanceof ApiClientError ? err.message : 'تغییر وضعیت انجام نشد.');
            setStatusTarget(null);
          });
        }}
      />
      <Modal open={columnsOpen} onClose={() => setColumnsOpen(false)} title="تنظیمات ستون‌ها">
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

function accountStatusOfLocal(row: StaffCustomer): string {
  return row.accountStatus ?? (row.status === 'BLOCKED' ? 'BLOCKED' : row.status === 'ACTIVE' || row.status === 'APPROVED' ? 'ACTIVE' : 'INACTIVE');
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link role="menuitem" href={href} className="block rounded-md px-3 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
      {children}
    </Link>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" type="button" className="block w-full rounded-md px-3 py-2 text-right text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500" onClick={onClick}>
      {children}
    </button>
  );
}
