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
    replaceDocumentImage: jest.fn(),
    saveProcessedPersonalPhoto: jest.fn(),
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
    internalKycApi.decide.mockResolvedValue({});
  });

  it('submits a rejection reason through the backend decision endpoint', async () => {
    signIn(['kyc.review']);
    const user = userEvent.setup();
    render(<KycDecisionPanel customerId="cust-1" />);
    await user.click(screen.getByRole('button', { name: 'رد' }));
    await user.type(screen.getByRole('textbox', { name: /دلیل/ }), 'مدارک ناخوانا و ناقص است');
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
    expect(screen.queryByRole('button', { name: 'رد' })).not.toBeInTheDocument();
  });

  it('disables approve after a document is already approved', async () => {
    signIn(['kyc.review']);
    internalKycApi.getDocuments.mockResolvedValue([
      uploadedDoc({ verificationStatus: 'APPROVED' }),
    ]);
    render(<KycDocumentList customerId="cust-approved" />);
    expect(await screen.findByText('این مدرک قبلاً تأیید شده است.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تأیید شده' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'رد مدرک' })).toBeEnabled();
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

  it('lays out documents in four desktop columns', async () => {
    signIn(['kyc.review']);
    render(<KycDocumentList customerId="cust-grid" />);
    await screen.findByText('روی کارت ملی');
    expect(document.querySelector('.xl\\:grid-cols-4')).not.toBeNull();
    expect(document.querySelector('.md\\:grid-cols-2')).not.toBeNull();
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
    const editors = await screen.findAllByRole('button', { name: 'ویرایش تصویر' });
    expect(editors).toHaveLength(2);
    await user.click(editors[0]!);
    expect(screen.queryByRole('button', { name: 'حذف پس‌زمینه' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'انصراف' }));
    await user.click(editors[1]!);
    expect(await screen.findByRole('button', { name: 'حذف پس‌زمینه' })).toBeInTheDocument();
  });
});
