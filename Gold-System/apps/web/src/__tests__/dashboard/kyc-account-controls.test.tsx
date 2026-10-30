import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KycAccountControls } from '@/components/dashboard/kyc-account-controls';
import type { StaffCustomer } from '@/lib/internal-api';
import { signIn } from './auth-state';

jest.mock('@/lib/auth', () => ({
  useAuth: () => require('./auth-state').authState,
}));

jest.mock('@/lib/internal-api', () => ({
  internalCustomersApi: {
    assignType: jest.fn(),
  },
  internalKycApi: {
    activate: jest.fn(),
  },
}));

const { internalCustomersApi, internalKycApi } = jest.requireMock('@/lib/internal-api') as {
  internalCustomersApi: { assignType: jest.Mock };
  internalKycApi: { activate: jest.Mock };
};

function makeCustomer(overrides: Partial<StaffCustomer> = {}): StaffCustomer {
  return {
    id: 'cust-1',
    customerNumber: 'CUST-000001',
    userId: 'user-1',
    firstName: 'علی',
    lastName: 'محمدی',
    fullName: 'علی محمدی',
    nationalId: '0012345678',
    mobile: '09123456789',
    email: null,
    dateOfBirth: null,
    address: null,
    type: null,
    gender: null,
    postalCode: null,
    phone: null,
    referenceSource: null,
    companyName: null,
    companyNationalId: null,
    companyEconomicId: null,
    contactName: null,
    contactTitle: null,
    secondaryMobile: null,
    workPhone: null,
    fax: null,
    workAddress: null,
    contactNotes: null,
    province: null,
    city: null,
    status: 'APPROVED',
    accountStatus: 'ACTIVE',
    rejectionReason: null,
    isTradeEligible: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('KycAccountControls', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signIn(['customer.read', 'kyc.review', 'customer.group.assign']);
    internalKycApi.activate.mockResolvedValue({ id: 'cust-1', status: 'ACTIVE', accountStatus: 'ACTIVE' });
    internalCustomersApi.assignType.mockResolvedValue(makeCustomer({ type: 'HOUSEHOLD' }));
  });

  it('keeps activation disabled until every document is approved', () => {
    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer({ status: 'UNDER_REVIEW' })}
        documentsApproved={false}
      />,
    );

    expect(screen.getByRole('button', { name: /فعال‌سازی حساب مشتری/ })).toBeDisabled();
    expect(screen.getByText('مدارک تأیید نشده')).toBeInTheDocument();
  });

  it('activates a verified customer whose documents are approved', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();

    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer({ status: 'UNDER_REVIEW' })}
        documentsApproved
        onChanged={onChanged}
      />,
    );

    const button = screen.getByRole('button', { name: /فعال‌سازی حساب مشتری/ });
    expect(button).toBeEnabled();

    await user.click(button);

    await waitFor(() => expect(internalKycApi.activate).toHaveBeenCalledWith('cust-1'));
    expect(await screen.findByText('حساب مشتری فعال شد.')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('shows the active state instead of an actionable button', () => {
    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer({ status: 'ACTIVE', type: 'HOUSEHOLD' })}
        documentsApproved
      />,
    );

    expect(screen.getByText('حساب فعال است')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /فعال‌سازی حساب مشتری/ })).toBeDisabled();
  });

  it('does not activate a suspended account', () => {
    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer({ status: 'SUSPENDED' })}
        documentsApproved
      />,
    );

    expect(screen.getByRole('button', { name: /فعال‌سازی حساب مشتری/ })).toBeDisabled();
  });

  it('saves the customer group', async () => {
    const user = userEvent.setup();
    const onChanged = jest.fn();

    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer()}
        documentsApproved
        onChanged={onChanged}
      />,
    );

    await user.selectOptions(screen.getByLabelText(/گروه مشتری/), 'HOUSEHOLD');
    await user.click(screen.getByRole('button', { name: 'ثبت گروه' }));

    await waitFor(() =>
      expect(internalCustomersApi.assignType).toHaveBeenCalledWith(
        'cust-1',
        'HOUSEHOLD',
        expect.any(String),
      ),
    );
    expect(await screen.findByText('گروه مشتری ثبت شد.')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
  });

  it('hides both actions without the matching permissions', () => {
    signIn(['kyc.documents.read']);

    render(
      <KycAccountControls
        customerId="cust-1"
        customer={makeCustomer()}
        documentsApproved
      />,
    );

    expect(screen.queryByRole('button', { name: /فعال‌سازی حساب مشتری/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ثبت گروه' })).not.toBeInTheDocument();
  });
});
