'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { creditCardClass } from './credit-ui';

export type CreditRequestState = 'none' | 'pending' | 'approved' | 'rejected';

const REQUEST_STATE: Record<CreditRequestState, { label: string; className: string }> = {
  none: { label: 'درخواستی ثبت نشده', className: 'bg-[#F8F9FA] text-[#6B7280]' },
  pending: { label: 'در انتظار بررسی', className: 'bg-blue-50 text-[#2563EB]' },
  approved: { label: 'تأیید شده', className: 'bg-green-50 text-[#16A34A]' },
  rejected: { label: 'رد شده', className: 'bg-red-50 text-[#DC2626]' },
};

export function CreditIncreaseRequest({ state = 'none' }: { state?: CreditRequestState }) {
  const [open, setOpen] = useState(false);
  const badge = REQUEST_STATE[state];
  return (
    <section aria-labelledby="credit-request-title" className={creditCardClass}>
      <div className="flex flex-col items-start gap-2">
        <h2 id="credit-request-title" className="text-base font-bold text-[#202124]">
          درخواست افزایش اعتبار
        </h2>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}>
          {badge.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-[#6B7280]">
        در صورت نیاز به اعتبار بیشتر، می‌توانید درخواست افزایش سقف اعتبار ثبت کنید.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-[#FFF4D6] px-4 text-sm font-semibold text-[#92400E] hover:bg-[#F8E7B8]"
      >
        <Plus className="h-4 w-4" aria-hidden />
        ثبت درخواست
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="ثبت درخواست افزایش اعتبار">
        <p className="text-sm leading-7 text-[#202124]">
          افزایش سقف اعتبار توسط پشتیبانی و پس از بررسی انجام می‌شود. ثبت درخواست از این صفحه هنوز به
          گردش‌کار بررسی متصل نیست، بنابراین درخواستی ذخیره نمی‌شود.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(false)}>
            متوجه شدم
          </Button>
        </div>
      </Modal>
    </section>
  );
}
