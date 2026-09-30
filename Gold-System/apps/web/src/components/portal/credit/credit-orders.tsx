import Link from 'next/link';
import { Check, Clock, Lock, Unlock, X } from 'lucide-react';
import { formatDate, formatWeight } from '@/lib/utils';
import {
  CREDIT_ORDER_KIND_LABEL,
  creditOrderKind,
  creditOrderSideLabel,
  creditOrders,
  type CreditOrderKind,
  type CreditOrderRow,
} from '@/lib/credit-view';
import { CreditRetry, CreditSection, CreditSkeleton, formatCreditMoney } from './credit-ui';

const KIND_STYLE: Record<CreditOrderKind, { className: string; icon: typeof Check }> = {
  reserved: { className: 'bg-amber-50 text-[#B45309]', icon: Lock },
  pending: { className: 'bg-blue-50 text-[#2563EB]', icon: Clock },
  consumed: { className: 'bg-red-50 text-[#DC2626]', icon: Check },
  released: { className: 'bg-green-50 text-[#16A34A]', icon: Unlock },
  cancelled: { className: 'bg-slate-100 text-[#6B7280]', icon: X },
};

export function CreditOrders({
  orders,
  loading,
  error,
  onRetry,
}: {
  orders: CreditOrderRow[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const rows = creditOrders(orders).slice(0, 5);
  return (
    <CreditSection
      title="سفارش‌های درگیر با اعتبار"
      id="credit-orders-title"
      action={
        <Link href="/portal/orders" className="inline-flex min-h-11 items-center text-xs font-semibold text-[#C8922E]">
          مشاهده همه
        </Link>
      }
    >
      {loading ? (
        <div className="mt-4 space-y-3" aria-hidden>
          <CreditSkeleton className="h-24 w-full" />
          <CreditSkeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <CreditRetry message="اطلاعات سفارش‌ها در حال حاضر قابل دریافت نیست." onRetry={onRetry} />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-[#F8F9FA] px-3 py-4 text-sm leading-7 text-[#202124]">
          سفارشی درگیر با اعتبار وجود ندارد.
        </p>
      ) : (
        <>
          <ul className="mt-4 space-y-3 lg:hidden">
            {rows.map((order) => (
              <li key={order.id}>
                <OrderCard order={order} />
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] text-[#6B7280]">
                  <th className="px-2 py-3 text-right font-medium">شماره سفارش</th>
                  <th className="px-2 py-3 text-right font-medium">نوع</th>
                  <th className="px-2 py-3 text-right font-medium">مقدار طلا</th>
                  <th className="px-2 py-3 text-right font-medium">ارزش</th>
                  <th className="px-2 py-3 text-right font-medium">وضعیت اعتبار</th>
                  <th className="px-2 py-3 text-right font-medium">تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => {
                  const kind = creditOrderKind(order);
                  return (
                    <tr key={order.id} className="border-b border-[#E5E7EB] last:border-0">
                      <td className="px-2 py-3 font-semibold">
                        <Link href={`/portal/orders/${order.id}`} className="inline-flex min-h-11 items-center text-[#202124]">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-2 py-3">{creditOrderSideLabel(order.side)}</td>
                      <td className="px-2 py-3 tabular-nums">{formatWeight(order.weightGrams)}</td>
                      <td className="px-2 py-3 tabular-nums">{formatCreditMoney(order.totalAmountRial)}</td>
                      <td className="px-2 py-3">{kind ? <KindBadge kind={kind} /> : '—'}</td>
                      <td className="px-2 py-3 text-[#6B7280]">{formatDate(order.submittedAt ?? order.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </CreditSection>
  );
}

function OrderCard({ order }: { order: CreditOrderRow }) {
  const kind = creditOrderKind(order);
  return (
    <Link
      href={`/portal/orders/${order.id}`}
      className="block rounded-xl border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#6B7280]">شماره سفارش</p>
          <p className="mt-0.5 font-bold text-[#202124]" dir="ltr">
            {order.orderNumber}
          </p>
        </div>
        {kind ? <KindBadge kind={kind} /> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <Field label="نوع" value={creditOrderSideLabel(order.side)} />
        <Field label="مقدار طلا" value={formatWeight(order.weightGrams)} />
        <Field label="ارزش" value={formatCreditMoney(order.totalAmountRial)} />
        <Field label="تاریخ" value={formatDate(order.submittedAt ?? order.createdAt)} />
      </dl>
    </Link>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-[#6B7280]">{label}</dt>
      <dd className="mt-0.5 break-words font-semibold tabular-nums text-[#202124]">{value}</dd>
    </div>
  );
}

function KindBadge({ kind }: { kind: CreditOrderKind }) {
  const style = KIND_STYLE[kind];
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${style.className}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {CREDIT_ORDER_KIND_LABEL[kind]}
    </span>
  );
}
