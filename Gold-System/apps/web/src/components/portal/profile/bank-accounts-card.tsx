'use client';

import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function BankAccountsCard() {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-800">
        <Landmark className="h-4 w-4 text-gold-700" aria-hidden />
        حساب‌های بانکی
      </h2>
      <p className="mt-4 rounded-xl bg-slate-50 px-3 py-4 text-sm text-muted-foreground">
        حساب بانکی تأییدشده‌ای ثبت نشده است.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-4 w-full gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4" aria-hidden />
        افزودن حساب بانکی جدید
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="افزودن حساب بانکی">
        <p className="text-sm leading-7 text-muted-foreground">
          ثبت حساب بانکی در سامانه هنوز از این صفحه انجام نمی‌شود. شماره کارت یا شبا را اینجا وارد
          نکنید. برای معرفی حساب، با پشتیبانی تماس بگیرید.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            بستن
          </Button>
        </div>
      </Modal>
    </section>
  );
}
