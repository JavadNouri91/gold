'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

export function PortalSupportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="پشتیبانی">
      <p className="text-sm text-muted-foreground leading-7">
        برای پیگیری سفارش، پرداخت و احراز هویت از بخش اعلان‌ها و سفارش‌های خود استفاده کنید. درخواست
        اعتبار از صفحه اعتبار ثبت و توسط پشتیبانی بررسی می‌شود.
      </p>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          بستن
        </Button>
      </div>
    </Modal>
  );
}
