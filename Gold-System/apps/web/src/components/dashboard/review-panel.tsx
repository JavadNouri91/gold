'use client';

import Link from 'next/link';
import { useState } from 'react';
import { StatusBadge } from '@/components/portal/status-badge';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from './confirm-dialog';
import { PermissionGate } from './permission-gate';
import { assignmentsApi, internalOrdersApi, internalTradesApi, type ReviewContext } from '@/lib/internal-api';
import { ApiClientError } from '@/lib/api';
import {
  CUSTOMER_STATUS_LABELS,
  CUSTOMER_TYPE_LABELS,
  KYC_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  QUOTATION_STATUS_LABELS,
  formatDateTime,
  formatMoney,
  formatWeight,
  statusLabel,
} from '@/lib/utils';

export function ReviewContextPanel({
  context,
  onChanged,
}: {
  context: ReviewContext;
  onChanged: () => void;
}) {
  const [action, setAction] = useState<'approve' | 'reject' | 'revision' | 'start' | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (reason?: string) => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'start') await assignmentsApi.startReview(context.order.id);
      if (action === 'approve') await internalOrdersApi.approve(context.order.id, reason);
      if (action === 'reject') await internalOrdersApi.reject(context.order.id, reason ?? '');
      if (action === 'revision') await internalOrdersApi.requestRevision(context.order.id, reason ?? '');
      setFeedback('وضعیت سفارش از سرور به‌روزرسانی شد.');
      setAction(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'عملیات انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    setBusy(true);
    setError(null);
    try {
      await assignmentsApi.assign(context.order.id, {
        assignedToUserId: reviewerId.trim(),
        notes: notes.trim() || undefined,
      });
      setAssignOpen(false);
      setFeedback('سفارش تخصیص داده شد.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'تخصیص انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  const confirmTrade = async () => {
    setBusy(true);
    setError(null);
    try {
      await internalTradesApi.confirm({ orderId: context.order.id });
      setFeedback('معامله از سفارش تأییدشده ایجاد شد.');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'ایجاد معامله انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {feedback ? <Alert variant="success">{feedback}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>سفارش</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p dir="ltr">{context.order.orderNumber}</p>
            <StatusBadge status={context.order.status} label={statusLabel(ORDER_STATUS_LABELS, context.order.status)} />
            <p>مبلغ: {formatMoney(context.order.totalAmountRial)}</p>
            <p>وزن: {formatWeight(context.order.weightGrams)}</p>
            <p>اعتبار رزرو شده: {formatMoney(context.order.reservedAmountRial)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>مشتری</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link className="font-medium text-gold-800" href={`/dashboard/customers/${context.customer.id}`}>
              {context.customer.firstName} {context.customer.lastName}
            </Link>
            <p dir="ltr">{context.customer.customerNumber}</p>
            <StatusBadge status={context.customer.status} label={statusLabel(CUSTOMER_STATUS_LABELS, context.customer.status)} />
            <p>نوع: {statusLabel(CUSTOMER_TYPE_LABELS, context.customer.type)}</p>
            <p>احراز هویت: {statusLabel(KYC_STATUS_LABELS, context.customer.kycStatus)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>اعتبار</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {context.account ? (
              <>
                <p>سقف: {formatMoney(context.account.creditLimitRial)}</p>
                <p>در دسترس: {formatMoney(context.account.availableCreditRial)}</p>
                <p>رزرو: {formatMoney(context.account.reservedCreditRial)}</p>
                <p>مصرف‌شده: {formatMoney(context.account.consumedCreditRial)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">حساب اعتباری برنگشته است.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>پیش‌فاکتور</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {context.quotation ? (
              <>
                <Link className="text-gold-800" href={`/dashboard/quotations/${context.quotation.id}`}>
                  <span dir="ltr">{context.quotation.quotationNumber}</span>
                </Link>
                <p>نسخه: {context.quotation.version.toLocaleString('fa-IR')}</p>
                <StatusBadge status={context.quotation.status} label={statusLabel(QUOTATION_STATUS_LABELS, context.quotation.status)} />
                <p>مبلغ قفل‌شده: {formatMoney(context.quotation.totalAmountRial)}</p>
                <p className="text-xs text-muted-foreground">مقادیر تصویر قیمت در زمان صدور هستند و دوباره محاسبه نمی‌شوند.</p>
                <p className="text-xs">{formatDateTime(context.quotation.generatedAt)}</p>
              </>
            ) : (
              <p className="text-muted-foreground">پیش‌فاکتور فعالی وجود ندارد.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>اقدام‌ها</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <PermissionGate anyOf="order.assign">
            <Button variant="outline" onClick={() => setAssignOpen(true)}>تخصیص بررسی‌کننده</Button>
          </PermissionGate>
          <PermissionGate anyOf="trade.review">
            <Button variant="outline" onClick={() => setAction('start')}>شروع بررسی</Button>
          </PermissionGate>
          <PermissionGate anyOf="trade.approve">
            <Button onClick={() => setAction('approve')}>تأیید سفارش</Button>
            <Button onClick={() => void confirmTrade()}>ایجاد معامله</Button>
          </PermissionGate>
          <PermissionGate anyOf="trade.reject">
            <Button variant="destructive" onClick={() => setAction('reject')}>رد سفارش</Button>
          </PermissionGate>
          <PermissionGate anyOf="trade.request_revision">
            <Button variant="outline" onClick={() => setAction('revision')}>درخواست اصلاح</Button>
          </PermissionGate>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        آستانه تأیید دوم در رابط کاربری محاسبه نمی‌شود. سرور تنها تأیید مجاز را اعمال می‌کند.
      </p>
      <ConfirmDialog
        open={action !== null}
        title="تأیید عملیات"
        message="پس از تأیید، وضعیت فقط مطابق قوانین سرور تغییر می‌کند."
        destructive={action === 'reject'}
        requireReason={action === 'reject' || action === 'revision' || action === 'approve'}
        minReason={action === 'revision' ? 10 : action === 'approve' ? 0 : 5}
        isLoading={busy}
        onClose={() => setAction(null)}
        onConfirm={(reason) => void run(reason)}
      />
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="تخصیص سفارش">
        <div className="space-y-3">
          <Input label="شناسه کاربر بررسی‌کننده" dir="ltr" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} />
          <Input label="یادداشت" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <p className="text-xs text-muted-foreground">فهرست کاربران داخلی از سرویس ارائه نشده است؛ شناسه کاربر را وارد کنید.</p>
          <Button disabled={!reviewerId.trim()} isLoading={busy} onClick={() => void assign()}>ثبت تخصیص</Button>
        </div>
      </Modal>
    </div>
  );
}
