'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { internalCustomersApi, internalKycApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ApiErrorState, SkeletonBlock } from '@/components/dashboard/states';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { CreditSummary, GrantCreditForm } from '@/components/dashboard/credit-panel';
import { KycDecisionPanel, KycDocumentList } from '@/components/dashboard/kyc-panel';
import { ConfirmDialog } from '@/components/dashboard/confirm-dialog';
import { CustomerEditDialog, Toast, TypeBadge, balanceTone } from '@/components/dashboard/customer-widgets';
import { StatusBadge } from '@/components/portal/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MobileNumber } from '@/components/ui/mobile-input';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api';
import {
  CUSTOMER_ACCOUNT_STATUS_LABELS,
  CUSTOMER_SEGMENT_LABELS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_VERIFICATION_LABELS,
  KYC_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  TRADE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  formatWeight,
  statusLabel,
} from '@/lib/utils';

const TABS = [
  { id: 'overview', label: 'نمای کلی' },
  { id: 'orders', label: 'سفارش‌ها' },
  { id: 'quotations', label: 'پیش‌فاکتورها' },
  { id: 'invoices', label: 'فاکتورها' },
  { id: 'payments', label: 'پرداخت‌ها' },
  { id: 'account', label: 'حساب مالی' },
  { id: 'notes', label: 'یادداشت‌ها' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function CustomerProfile({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const tab: TabId = TABS.some((item) => item.id === requested) ? (requested as TabId) : 'overview';
  const allowed = hasPermission(user?.permissions, 'customer.read');
  const canAccount = hasPermission(user?.permissions, 'customer.account.read');
  const canKyc = hasPermission(user?.permissions, 'kyc.review');
  const canManage = hasPermission(user?.permissions, 'customer.group.assign');
  const [type, setType] = useState('HOUSEHOLD');
  const [typeMessage, setTypeMessage] = useState<string | null>(null);
  const [typeError, setTypeError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  const customer = useSWR(allowed ? ['customer', customerId] : null, () =>
    internalCustomersApi.getById(customerId),
  );
  const workspace = useSWR(allowed ? ['customer-workspace', customerId] : null, () =>
    internalCustomersApi.workspace(customerId),
  );
  const account = useSWR(canAccount ? ['account', customerId] : null, () =>
    internalCustomersApi.getAccount(customerId),
  );
  const history = useSWR(canKyc ? ['kyc-history', customerId] : null, () =>
    internalKycApi.history(customerId),
  );

  if (!allowed) return <ForbiddenNotice permission="customer.read" />;
  if (customer.error) return <ApiErrorState error={customer.error} onRetry={() => void customer.mutate()} />;
  if (!customer.data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <SkeletonBlock className="h-16" />
        <SkeletonBlock className="h-28" />
      </div>
    );
  }

  const profile = customer.data;
  const metrics = workspace.data?.metrics;
  const accountStatus = profile.accountStatus ?? workspace.data?.customer.accountStatus ?? 'INACTIVE';
  const verification = workspace.data?.verificationStatus ?? 'UNVERIFIED';
  const segment = workspace.data?.segment ?? profile.segment ?? 'REGULAR';

  const selectTab = (next: TabId) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set('tab', next);
    router.replace(`/dashboard/customers/${customerId}?${query.toString()}`);
  };

  const assignType = async () => {
    setTypeError(null);
    try {
      await internalCustomersApi.assignType(customerId, type);
      setTypeMessage('نوع مشتری ثبت شد.');
      setToast('نوع مشتری ثبت شد.');
      void customer.mutate();
      void workspace.mutate();
    } catch (err) {
      setTypeError(err instanceof ApiClientError ? err.message : 'ثبت نوع انجام نشد.');
    }
  };

  const addNote = async () => {
    setNoteError(null);
    try {
      await internalCustomersApi.addNote(customerId, note.trim());
      setNote('');
      setToast('یادداشت ثبت شد.');
      void workspace.mutate();
    } catch (err) {
      setNoteError(err instanceof ApiClientError ? err.message : 'ثبت یادداشت انجام نشد.');
    }
  };

  const balance = metrics?.balanceRial;
  const tone = balanceTone(balance);

  return (
    <div className="space-y-6">
      <nav aria-label="مسیر" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">داشبورد</Link>
        <span aria-hidden="true">/</span>
        <Link href="/dashboard/customers" className="hover:text-foreground">مشتریان</Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{profile.fullName}</span>
      </nav>
      <PageHeader
        title={profile.fullName || `${profile.firstName} ${profile.lastName}`}
        description={profile.customerNumber}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage ? <Button variant="outline" onClick={() => setEditing(true)}>ویرایش</Button> : null}
            <Link href={`/dashboard/orders?customerId=${customerId}`}><Button variant="outline">ثبت سفارش</Button></Link>
            <Link href="/dashboard/customers"><Button variant="outline">بازگشت به فهرست</Button></Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 text-sm">
        <MobileNumber value={profile.mobile} />
        <Badge variant={accountStatus === 'ACTIVE' ? 'green' : accountStatus === 'BLOCKED' ? 'red' : 'gray'}>
          {statusLabel(CUSTOMER_ACCOUNT_STATUS_LABELS, accountStatus)}
        </Badge>
        <Badge>{statusLabel(CUSTOMER_SEGMENT_LABELS, segment)}</Badge>
        <TypeBadge type={profile.type} />
        <span className="text-muted-foreground">
          احراز: {statusLabel(CUSTOMER_VERIFICATION_LABELS, verification)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="مجموع خرید" value={metrics ? formatMoney(metrics.totalPurchaseRial) : '…'} />
        <Metric label="مجموع وزن طلا" value={metrics ? formatWeight(metrics.totalWeightGrams) : '…'} />
        <Metric label="تعداد سفارش" value={metrics ? metrics.orderCount.toLocaleString('fa-IR') : '…'} />
        <Metric label="آخرین خرید" value={metrics ? formatDate(metrics.lastPurchaseAt) : '…'} />
        <Metric
          label="مانده حساب"
          value={canAccount ? formatMoney(balance) : '—'}
          className={tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-700' : undefined}
        />
      </div>

      {workspace.error ? <ApiErrorState error={workspace.error} onRetry={() => void workspace.mutate()} /> : null}

      <div role="tablist" aria-label="پرونده مشتری" className="flex gap-2 overflow-x-auto border-b">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 ${
              tab === item.id ? 'border-gold-500 font-semibold text-gold-800' : 'border-transparent text-muted-foreground'
            }`}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>پرونده</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p dir="ltr">{profile.nationalId}</p>
              <p>{profile.email ?? '—'}</p>
              <p>{profile.address ?? '—'}</p>
              <p>نوع: {statusLabel(CUSTOMER_TYPE_LABELS, profile.type)}</p>
              <p>وضعیت حساب: {statusLabel(CUSTOMER_ACCOUNT_STATUS_LABELS, accountStatus)}</p>
              <p>وضعیت احراز: {statusLabel(CUSTOMER_VERIFICATION_LABELS, verification)}</p>
              <p>ثبت: {formatDate(profile.createdAt)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>نوع مشتری</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {typeMessage ? <Alert variant="success">{typeMessage}</Alert> : null}
              {typeError ? <Alert variant="error">{typeError}</Alert> : null}
              <PermissionGate anyOf="customer.group.assign" fallback={<p className="text-sm text-muted-foreground">تغییر نوع نیاز به مجوز تخصیص گروه دارد.</p>}>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-sm">
                    نوع
                    <select className="mt-1 block h-10 rounded-md border px-3" value={type} onChange={(event) => setType(event.target.value)}>
                      {Object.entries(CUSTOMER_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <Button onClick={() => void assignType()}>ثبت نوع</Button>
                </div>
              </PermissionGate>
            </CardContent>
          </Card>
          <PermissionGate anyOf={['kyc.documents.read', 'kyc.review']}>
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>مدارک احراز هویت</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <PermissionGate anyOf="kyc.documents.read" fallback={<p className="text-sm">مشاهده مدرک مجاز نیست.</p>}>
                  <KycDocumentList customerId={customerId} />
                </PermissionGate>
                <KycDecisionPanel customerId={customerId} onDone={() => { void history.mutate(); void customer.mutate(); }} />
                {history.data?.length ? (
                  <ul className="divide-y text-sm">
                    {history.data.map((item) => (
                      <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                        <StatusBadge status={item.status} label={statusLabel(KYC_STATUS_LABELS, item.status)} />
                        <span>{formatDateTime(item.createdAt)}</span>
                        <span>{item.decisionReason ?? ''}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </PermissionGate>
        </div>
      ) : null}

      {tab === 'orders' ? (
        <RecordList
          empty="سفارشی ثبت نشده است."
          rows={(workspace.data?.orders ?? []).map((order) => ({
            id: order.id,
            href: `/dashboard/orders/${order.id}`,
            title: order.orderNumber,
            amount: formatMoney(order.totalAmountRial),
            extra: formatWeight(order.weightGrams),
            status: order.status,
            statusLabel: statusLabel(ORDER_STATUS_LABELS, order.status),
            date: formatDate(order.createdAt),
          }))}
        />
      ) : null}

      {tab === 'quotations' ? (
        <RecordList
          empty="پیش‌فاکتوری صادر نشده است."
          rows={(workspace.data?.quotations ?? []).map((row) => ({
            id: row.id,
            href: `/dashboard/quotations/${row.id}`,
            title: row.quotationNumber,
            amount: formatMoney(row.totalAmountRial),
            status: row.status,
            statusLabel: statusLabel(QUOTATION_STATUS_LABELS, row.status),
            date: formatDate(row.createdAt),
          }))}
        />
      ) : null}

      {tab === 'invoices' ? (
        <RecordList
          empty="فاکتور تأییدشده‌ای برای این مشتری نیست. فاکتور از معامله تأییدشده ساخته می‌شود."
          rows={(workspace.data?.invoices ?? []).map((row) => ({
            id: row.id,
            href: `/dashboard/trades/${row.id}`,
            title: row.tradeNumber,
            amount: formatMoney(row.totalAmountRial),
            status: row.status,
            statusLabel: statusLabel(TRADE_STATUS_LABELS, row.status),
            date: formatDate(row.createdAt),
          }))}
        />
      ) : null}

      {tab === 'payments' ? (
        canAccount && workspace.data?.payments ? (
          <RecordList
            empty="پرداختی ثبت نشده است."
            rows={workspace.data.payments.map((row) => ({
              id: row.id,
              href: `/dashboard/payments/${row.id}`,
              title: statusLabel(PAYMENT_METHOD_LABELS, row.method),
              amount: formatMoney(row.amount),
              status: row.status,
              statusLabel: statusLabel(PAYMENT_STATUS_LABELS, row.status),
              date: formatDate(row.createdAt),
            }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">نمایش پرداخت‌ها نیاز به مجوز مشاهده حساب مشتری دارد.</p>
        )
      ) : null}

      {tab === 'account' ? (
        <Card>
          <CardHeader><CardTitle>حساب و اعتبار</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!canAccount ? <p className="text-sm text-muted-foreground">نمایش اعتبار نیاز به مجوز مشاهده حساب مشتری دارد.</p> : null}
            {canAccount ? <p className="text-sm">مانده حساب: <span className={tone === 'neg' ? 'text-red-600' : tone === 'pos' ? 'text-emerald-700' : ''}>{formatMoney(balance)}</span></p> : null}
            {account.error ? <ApiErrorState error={account.error} /> : null}
            {account.data ? <CreditSummary account={account.data} /> : null}
            <GrantCreditForm customerId={customerId} onGranted={() => void account.mutate()} />
            <Link href="/dashboard/ledger/financial" className="text-sm text-gold-800">دفتر مالی</Link>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'notes' ? (
        <Card>
          <CardHeader><CardTitle>یادداشت‌ها</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {canManage ? (
              <div className="space-y-2">
                {noteError ? <Alert variant="error">{noteError}</Alert> : null}
                <label className="block text-sm font-medium" htmlFor="customer-note">یادداشت جدید</label>
                <textarea
                  id="customer-note"
                  className="min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  value={note}
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                />
                <Button disabled={!note.trim()} onClick={() => void addNote()}>ثبت یادداشت</Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ثبت یادداشت نیاز به مجوز تخصیص گروه مشتری دارد.</p>
            )}
            {(workspace.data?.notes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">یادداشتی ثبت نشده است.</p>
            ) : (
              <ul className="divide-y text-sm">
                {workspace.data?.notes.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <p>{item.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.authorName ?? 'کاربر'} — {formatDateTime(item.createdAt)}
                      </p>
                    </div>
                    {canManage ? (
                      <Button variant="outline" size="sm" onClick={() => setNoteToDelete(item.id)}>
                        حذف
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <CustomerEditDialog
        customer={editing ? profile : null}
        open={editing}
        onClose={() => setEditing(false)}
        onSaved={(message) => {
          setToast(message);
          void customer.mutate();
          void workspace.mutate();
        }}
      />
      <ConfirmDialog
        open={Boolean(noteToDelete)}
        title="حذف یادداشت"
        message="این یادداشت حذف می‌شود و قابل بازگشت نیست."
        confirmLabel="حذف"
        destructive
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => {
          if (!noteToDelete) return;
          void internalCustomersApi.deleteNote(customerId, noteToDelete).then(() => {
            setToast('یادداشت حذف شد.');
            setNoteToDelete(null);
            void workspace.mutate();
          });
        }}
      />
      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-lg font-bold ${className ?? ''}`}>{value}</p>
    </div>
  );
}

function RecordList({
  rows,
  empty,
}: {
  empty: string;
  rows: Array<{
    id: string;
    href: string;
    title: string;
    amount: string;
    extra?: string;
    status: string;
    statusLabel: string;
    date: string;
  }>;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-white text-sm">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href={row.href} className="font-medium text-gold-800" dir="ltr">{row.title}</Link>
          <span>{row.amount}</span>
          {row.extra ? <span>{row.extra}</span> : null}
          <StatusBadge status={row.status} label={row.statusLabel} />
          <span className="text-muted-foreground">{row.date}</span>
        </li>
      ))}
    </ul>
  );
}
