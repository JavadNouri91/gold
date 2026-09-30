'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأیید',
  destructive = false,
  requireReason = false,
  reasonLabel = 'دلیل',
  minReason = 5,
  isLoading = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  minReason?: number;
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const tooShort = requireReason && reason.trim().length < minReason;

  return (
    <Modal
      open={open}
      onClose={() => {
        setReason('');
        onClose();
      }}
      title={title}
    >
      <p className="mb-4 text-sm text-muted-foreground">{message}</p>
      {requireReason ? (
        <div className="mb-4">
          <Input
            label={reasonLabel}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            hint={`حداقل ${minReason.toLocaleString('fa-IR')} نویسه`}
          />
        </div>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          انصراف
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={tooShort}
          isLoading={isLoading}
          onClick={() => onConfirm(requireReason ? reason.trim() : undefined)}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
