'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { CustomerAccount } from '@/lib/api';
import { formatRial } from '@/lib/utils';

export function TradingCreditCard({ account }: { account: CustomerAccount }) {
  const limit = Number(account.creditLimitRial) || 0;
  const available = Number(account.availableCreditRial) || 0;
  const used = Number(account.reservedCreditRial || 0) + Number(account.consumedCreditRial || 0);
  const ratio = limit > 0 ? Math.min(1, Math.max(0, available / limit)) : 0;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-800">اعتبار معاملاتی</h2>
      <div className="mt-4 flex items-center gap-4">
        <CreditRing ratio={ratio} label={formatRial(account.availableCreditRial)} />
        <dl className="min-w-0 flex-1 space-y-2 text-sm">
          <Row label="کل اعتبار" value={formatRial(account.creditLimitRial)} />
          <Row label="استفاده شده" value={formatRial(String(used))} muted />
          <Row label="قابل استفاده" value={formatRial(account.availableCreditRial)} accent />
        </dl>
      </div>
      <Link
        href="/portal/credit"
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
      >
        <Plus className="h-4 w-4" />
        درخواست افزایش اعتبار
      </Link>
    </section>
  );
}

function Row({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`truncate text-xs font-semibold tabular-nums ${
          accent ? 'text-emerald-700' : muted ? 'text-slate-500' : 'text-slate-800'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function CreditRing({ ratio, label }: { ratio: number; label: string }) {
  const size = 108;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - ratio);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ecfdf5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#10b981"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
        <span className="text-[10px] text-muted-foreground">قابل استفاده</span>
        <span className="text-[10px] font-bold leading-tight tabular-nums text-emerald-800">{label}</span>
      </div>
    </div>
  );
}
