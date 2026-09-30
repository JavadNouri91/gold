import React from 'react';
import { render, screen } from '@testing-library/react';
import { validateKycFile, kycSteps, primaryCta, uploadErrorMessage } from '@/lib/kyc-present';
import { clampCrop, resizeCrop } from '@/lib/kyc-image-edit';
import { KycExperience } from '@/components/portal/kyc/kyc-experience';
import type { OwnKycOverview } from '@/lib/api';

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    kycApi: {
      ...actual.kycApi,
      getOwnDocumentFile: jest.fn(() => new Promise(() => undefined)),
    },
  };
});

function overview(phase: OwnKycOverview['phase']): OwnKycOverview {
  return {
    phase,
    identityComplete: true,
    customerStatus: phase === 'UNDER_REVIEW' ? 'UNDER_REVIEW' : 'PENDING',
    rejectionReason: null,
    submittedAt: phase === 'NOT_STARTED' ? null : '2026-09-27T11:02:00.000Z',
    upload: { maxBytes: 10 * 1024 * 1024, mimeTypes: ['image/jpeg', 'application/pdf'] },
    documents: [
      {
        type: 'national_id_front',
        label: 'روی کارت ملی',
        required: true,
        canUpload: phase === 'NOT_STARTED',
        canDelete: false,
        displayStatus: phase === 'NOT_STARTED' ? 'NOT_UPLOADED' : 'UNDER_REVIEW',
        file: null,
      },
    ],
    history: phase === 'NOT_STARTED'
      ? []
      : [
          {
            id: 'review-1',
            occurredAt: '2026-09-27T11:30:00.000Z',
            title: 'شروع بررسی',
            statusLabel: 'در حال بررسی',
            tone: 'pending',
            description: 'بررسی مدارک آغاز شد.',
          },
        ],
  };
}

describe('kyc presentation', () => {
  const policy = { maxBytes: 5 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'application/pdf'] };

  it('rejects an empty selection, a wrong type, and an oversized file', () => {
    expect(validateKycFile(null, policy)).toBe('فایل انتخاب نشده است.');
    expect(validateKycFile(new File(['x'], 'note.gif', { type: 'image/gif' }), policy)).toBe(
      'فرمت فایل مجاز نیست.',
    );
    const big = { size: policy.maxBytes + 1, type: 'image/jpeg', name: 'id.jpg' } as File;
    expect(validateKycFile(big, policy)).toBe('حجم فایل بیش از حد مجاز است.');
    expect(validateKycFile(new File(['jpg'], 'id.jpg', { type: 'image/jpeg' }), policy)).toBeNull();
  });

  it('hides the call to action while the case is under review', () => {
    expect(primaryCta('UNDER_REVIEW')).toBeNull();
    expect(primaryCta('NEEDS_CORRECTION')?.label).toBe('اصلاح مدارک');
    expect(primaryCta('NOT_STARTED')?.label).toBe('شروع احراز هویت');
  });

  it('marks document review as the current step after submission', () => {
    const steps = kycSteps('UNDER_REVIEW', true);
    expect(steps.map((step) => step.state)).toEqual(['done', 'done', 'current', 'upcoming']);
  });

  it('does not surface a raw server message', () => {
    expect(uploadErrorMessage(Object.assign(new Error('File type image/gif is not allowed'), { code: 'BAD_REQUEST' }))).toBe(
      'فرمت فایل مجاز نیست.',
    );
    expect(uploadErrorMessage(new Error('connect ECONNREFUSED 10.0.0.1'))).toBe(
      'ارسال مدرک انجام نشد. لطفاً دوباره تلاش کنید.',
    );
  });

  it('keeps a crop inside the image when it is moved or resized', () => {
    expect(clampCrop({ x: -0.2, y: 0.2, w: 0.5, h: 0.5 })).toEqual({ x: 0, y: 0.2, w: 0.5, h: 0.5 });
    expect(resizeCrop({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }, 'move', 0.8, 0).x).toBeCloseTo(0.6);
    const shrunk = resizeCrop({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 'se', -0.9, -0.9);
    expect(shrunk.w).toBeGreaterThanOrEqual(0.12);
    expect(shrunk.h).toBeGreaterThanOrEqual(0.12);
  });
});

describe('KycExperience', () => {
  it('shows the start action and empty history before any document is sent', () => {
    render(<KycExperience overview={overview('NOT_STARTED')} onChanged={async () => undefined} />);
    expect(screen.getByRole('button', { name: 'شروع احراز هویت' })).toBeInTheDocument();
    expect(screen.getByText('هنوز سابقه‌ای ثبت نشده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'آپلود مدرک' })).toBeInTheDocument();
  });

  it('hides the primary action while review is in progress', () => {
    render(<KycExperience overview={overview('UNDER_REVIEW')} onChanged={async () => undefined} />);
    expect(screen.getByText('احراز هویت شما در حال بررسی است')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع احراز هویت' })).not.toBeInTheDocument();
    expect(screen.getAllByText('شروع بررسی').length).toBeGreaterThan(0);
  });

  it('lets a pending document be removed and a rejected one be uploaded again', () => {
    const pending = overview('SUBMITTED');
    pending.documents[0] = {
      ...pending.documents[0],
      canUpload: true,
      canDelete: true,
      displayStatus: 'SUBMITTED',
      file: {
        id: 'doc-1',
        fileName: 'id.jpg',
        fileMimeType: 'image/jpeg',
        fileSizeBytes: 1200,
        status: 'PENDING',
        rejectionReason: null,
        createdAt: '2026-09-27T11:02:00.000Z',
        reviewedAt: null,
      },
    };
    const { unmount } = render(<KycExperience overview={pending} onChanged={async () => undefined} />);
    expect(screen.getByRole('button', { name: 'حذف مدرک' })).toBeInTheDocument();
    unmount();

    const rejected = overview('NEEDS_CORRECTION');
    rejected.documents[0] = {
      ...rejected.documents[0],
      canUpload: true,
      canDelete: false,
      displayStatus: 'NEEDS_CORRECTION',
      file: {
        id: 'doc-2',
        fileName: 'id.jpg',
        fileMimeType: 'image/jpeg',
        fileSizeBytes: 1200,
        status: 'REJECTED',
        rejectionReason: 'تصویر خوانا نیست.',
        createdAt: '2026-09-27T11:02:00.000Z',
        reviewedAt: '2026-09-27T12:00:00.000Z',
      },
    };
    render(<KycExperience overview={rejected} onChanged={async () => undefined} />);
    expect(screen.getByRole('button', { name: 'بارگذاری مجدد' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف مدرک' })).not.toBeInTheDocument();
  });
});
