'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { hasPermission } from '@/lib/permissions';
import { purchasesApi, suppliersApi } from '@/lib/internal-api';
import { PageHeader } from '@/components/dashboard/page-header';
import { ForbiddenNotice, PermissionGate } from '@/components/dashboard/permission-gate';
import { ApiErrorState } from '@/components/dashboard/states';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/portal/status-badge';
import { SUPPLIER_STATUS_LABELS, formatMoney, statusLabel } from '@/lib/utils';

export default function SupplierDetailPage({ params }: { params: { id: string } }) {
  const { user } = useAuth();
  const allowed = hasPermission(user?.permissions, 'supplier.read');
  const supplier = useSWR(allowed ? ['supplier', params.id] : null, () => suppliersApi.getById(params.id));
  const account = useSWR(
    hasPermission(user?.permissions, ['supplier_account.read', 'supplier_account.manage'])
      ? ['supplier-account', params.id]
      : null,
    () => suppliersApi.account(params.id),
  );
  const purchases = useSWR(
    hasPermission(user?.permissions, 'purchase.read') ? ['supplier-purchases', params.id] : null,
    () => purchasesApi.list({ supplierId: params.id, limit: 20, offset: 0 }),
  );

  if (!allowed) return <ForbiddenNotice permission="supplier.read" />;

  return (
    <div className="space-y-4">
      <PageHeader title={supplier.data?.name ?? 'تأمین‌کننده'} description={supplier.data?.supplierNumber} />
      {supplier.error ? <ApiErrorState error={supplier.error} /> : null}
      {supplier.data ? (
        <Card>
          <CardHeader><CardTitle>مشخصات</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <StatusBadge status={supplier.data.status} label={statusLabel(SUPPLIER_STATUS_LABELS, supplier.data.status)} />
            <p>{supplier.data.contactName ?? '—'}</p>
            <p dir="ltr">{supplier.data.contactPhone ?? '—'}</p>
            <p>حالت ارتباط: {supplier.data.integrationMode}</p>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>حساب تأمین‌کننده</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <PermissionGate anyOf={['supplier_account.read', 'supplier_account.manage']} fallback={<p>مجوز حساب تأمین‌کننده ندارید.</p>}>
            {account.error ? <ApiErrorState error={account.error} /> : null}
            {account.data ? (
              <>
                <p>خرید {formatMoney(account.data.totalPurchasedRial)}</p>
                <p>پرداخت‌شده {formatMoney(account.data.totalPaidRial)}</p>
                <p>مانده تعهد {formatMoney(account.data.outstandingRial)}</p>
                <p>وضعیت حساب {account.data.status}</p>
              </>
            ) : null}
          </PermissionGate>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>خریدها</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {(purchases.data ?? []).map((purchase) => (
              <li key={purchase.id} className="flex justify-between py-2">
                <Link href={`/dashboard/purchases/${purchase.id}`} dir="ltr">{purchase.purchaseNumber}</Link>
                <span>{formatMoney(purchase.totalAmountRial)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
