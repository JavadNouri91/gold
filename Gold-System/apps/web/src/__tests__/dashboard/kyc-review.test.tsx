import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KycDecisionPanel, KycDocumentList } from '@/components/dashboard/kyc-panel';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalKycApi: {
    getDocuments: jest.fn().mockResolvedValue([]),
    getDocumentFile: jest.fn(() => new Promise(() => undefined)),
    uploadDocument: jest.fn().mockResolvedValue({}),
    deleteDocument: jest.fn().mockResolvedValue(undefined),
    replaceDocumentImage: jest.fn(),
    saveProcessedPersonalPhoto: jest.fn(),
    reopenDocument: jest.fn().mockResolvedValue({}),
    decideDocument: jest.fn().mockResolvedValue({}),
    startReview: jest.fn(),
    decide: jest.fn().mockResolvedValue({}),
    history: jest.fn(),
  },
}));

const { internalKycApi } = jest.requireMock('@/lib/internal-api') as {
  internalKycApi: {
    getDocuments: jest.Mock;
    getDocumentFile: jest.Mock;
    decideDocument: jest.Mock;
    reopenDocument: jest.Mock;
    decide: jest.Mock;
  };
};

function uploadedDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    customerId: 'cust-1',
    documentType: 'national_id_front',
    fileName: 'front.jpg',
    fileMimeType: 'image/jpeg',
    fileSizeBytes: 1200,
    verificationStatus: 'PENDING',
    rejectionReason: null,
    createdAt: '2026-10-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('KYC review', () => {
  beforeEach(() => {
    internalKycApi.getDocuments.mockResolvedValue([]);
    internalKycApi.getDocumentFile.mockImplementation(() => new Promise(() => undefined));
    internalKycApi.decideDocument.mockResolvedValue({});
    internalKycApi.reopenDocument.mockResolvedValue({});
    internalKycApi.decide.mockResolvedValue({});
  });

  it('submits a rejection reason through the backend decision endpoint', async () => {
    signIn(['kyc.review']);
    const user = userEvent.setup();
    render(<KycDecisionPanel customerId="cust-1" reviewStatus="UNDER_REVIEW" />);
    await user.click(screen.getByRole('button', { name: 'رد درخواست' }));
    const reasonFields = screen.getAllByRole('textbox', { name: /دلیل/ });
    await user.type(reasonFields[reasonFields.length - 1]!, 'مدارک ناخوانا و ناقص است');
    const confirmButtons = screen.getAllByRole('button', { name: 'تأیید' });
    await user.click(confirmButtons[confirmButtons.length - 1]!);
    expect(internalKycApi.decide).toHaveBeenCalledWith(
      'cust-1',
      'REJECT',
      'مدارک ناخوانا و ناقص است',
    );
  });

  it('does not offer a decision to a user without kyc.review', () => {
    signIn(['customer.read']);
    render(<KycDecisionPanel customerId="cust-1" />);
    expect(screen.queryByRole('button', { name: 'رد درخواست' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تأیید احراز هویت' })).not.toBeInTheDocument();
  });

  it('disables final approval when required documents are not approved', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([uploadedDoc()]);
    render(<KycDecisionPanel customerId="cust-incomplete" reviewStatus="UNDER_REVIEW" />);
    expect(await screen.findByRole('button', { name: 'تأیید احراز هویت' })).toBeDisabled();
    expect(screen.getByText(/همه مدارک الزامی هنوز بررسی و تأیید نشده‌اند|مدرک الزامی هنوز ارسال نشده/)).toBeInTheDocument();
  });

  it('disables approve after a document is already approved', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([
      uploadedDoc({ verificationStatus: 'APPROVED' }),
    ]);
    render(<KycDocumentList customerId="cust-approved" />);
    expect(await screen.findByRole('button', { name: 'تأیید شده' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'رد مدرک' })).toBeDisabled();
  });

  it('requires a rejection reason before rejecting one document', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([uploadedDoc()]);
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-pending" />);
    await user.click(await screen.findByRole('button', { name: 'رد مدرک' }));
    const confirm = screen.getByRole('button', { name: 'تأیید' });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: /دلیل رد مدرک/ }), 'تصویر کارت ملی خوانا نیست');
    await user.click(confirm);
    await waitFor(() =>
      expect(internalKycApi.decideDocument).toHaveBeenCalledWith(
        'cust-pending',
        'doc-1',
        'REJECT',
        'تصویر کارت ملی خوانا نیست',
      ),
    );
  });

    it('lets a reviewer upload a missing document for the customer', async () => {
    signIn(['kyc.review']);
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-missing" />);
    await user.click(await screen.findByRole('button', { name: 'عملیات روی کارت ملی' }));
    await user.click(screen.getByRole('menuitem', { name: 'آپلود مدرک' }));
    expect(await screen.findByRole('heading', { name: /ارسال روی کارت ملی/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'دوربین' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'گالری' })).toBeInTheDocument();
    expect(screen.getByLabelText('ناحیه کشیدن و رها کردن فایل مدرک')).toBeInTheDocument();
  });

  it('does not offer staff upload without kyc.review', async () => {
    signIn(['kyc.documents.read']);
    render(<KycDocumentList customerId="cust-readonly" />);
    await screen.findByText('روی کارت ملی');
    expect(screen.queryByRole('button', { name: 'عملیات روی کارت ملی' })).not.toBeInTheDocument();
  });

  it('lets a reviewer edit or delete an approved document from the card menu', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([
      uploadedDoc({ verificationStatus: 'APPROVED' }),
    ]);
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-approved-edit" />);
    await user.click(await screen.findByRole('button', { name: 'عملیات روی کارت ملی' }));
    expect(screen.getByRole('menuitem', { name: 'بازنگری تصویر' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'ویرایش تصویر' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'بارگذاری مجدد' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'حذف مدرک' })).toBeInTheDocument();
  });

  it('unlocks reject after staff reopens an approved document', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([
      uploadedDoc({ verificationStatus: 'APPROVED' }),
    ]);
    internalKycApi.reopenDocument.mockImplementation(async () => {
      internalKycApi.getDocuments.mockResolvedValue([
        uploadedDoc({ verificationStatus: 'UNDER_REVIEW' }),
      ]);
      return uploadedDoc({ verificationStatus: 'UNDER_REVIEW' });
    });
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-reopen" />);
    expect(await screen.findByRole('button', { name: 'رد مدرک' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'عملیات روی کارت ملی' }));
    await user.click(screen.getByRole('menuitem', { name: 'بازنگری تصویر' }));
    await user.click(screen.getByRole('button', { name: 'بازنگری تصویر' }));
    await waitFor(() =>
      expect(internalKycApi.reopenDocument).toHaveBeenCalledWith('cust-reopen', 'doc-1'),
    );
    expect(await screen.findByRole('button', { name: 'رد مدرک' })).toBeEnabled();
  });

  it('offers upload again after a document is deleted', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([uploadedDoc()]);
    internalKycApi.deleteDocument.mockImplementation(async () => {
      internalKycApi.getDocuments.mockResolvedValue([]);
    });
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-deleted" />);
    await user.click(await screen.findByRole('button', { name: 'عملیات روی کارت ملی' }));
    await user.click(screen.getByRole('menuitem', { name: 'حذف مدرک' }));
    await user.click(screen.getByRole('button', { name: 'حذف مدرک' }));
    await waitFor(() => expect(internalKycApi.deleteDocument).toHaveBeenCalledWith('cust-deleted', 'doc-1'));
    const uploads = await screen.findAllByRole('button', { name: 'آپلود مدرک' });
    await user.click(uploads[0]!);
    expect(await screen.findByRole('heading', { name: /ارسال روی کارت ملی/ })).toBeInTheDocument();
  });

  it('lays out documents in four desktop columns', async () => {
    signIn(['kyc.review']);
    render(<KycDocumentList customerId="cust-grid" />);
    await screen.findByText('روی کارت ملی');
    expect(document.querySelector('.xl\\:grid-cols-4')).not.toBeNull();
    expect(document.querySelector('.lg\\:grid-cols-3')).not.toBeNull();
    expect(document.querySelector('.sm\\:grid-cols-2')).not.toBeNull();
  });

  it('offers background removal inside the personal photo editor', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocumentFile.mockResolvedValue(new Blob(['image'], { type: 'image/jpeg' }));
    internalKycApi.getDocuments.mockResolvedValue([
      uploadedDoc({ documentType: 'national_id_front' }),
      uploadedDoc({
        id: 'photo-1',
        documentType: 'personal_photo',
        fileName: 'photo.jpg',
      }),
    ]);
    const user = userEvent.setup();
    render(<KycDocumentList customerId="cust-photo" />);
    await user.click(await screen.findByRole('button', { name: 'عملیات روی کارت ملی' }));
    await user.click(screen.getByRole('menuitem', { name: 'ویرایش تصویر' }));
    expect(await screen.findByRole('button', { name: 'چرخش چپ' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'حذف پس‌زمینه' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'عملیات عکس پرسنلی' }));
    await user.click(screen.getByRole('menuitem', { name: 'ویرایش تصویر' }));
    expect(await screen.findByRole('button', { name: 'حذف پس‌زمینه' })).toBeInTheDocument();
  });
});
