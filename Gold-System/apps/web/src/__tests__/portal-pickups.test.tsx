import { render, screen } from '@testing-library/react';
import { PickupStatusStepper } from '@/components/portal/pickups/pickup-status-stepper';

describe('PickupStatusStepper', () => {
  it('shows cancelled label for CANCELLED', () => {
    render(<PickupStatusStepper status="CANCELLED" />);
    expect(screen.getByText('لغو شده')).toBeInTheDocument();
  });

  it('renders a progress bar with four labeled steps', () => {
    render(<PickupStatusStepper status="PREPARING" />);
    const bar = screen.getByRole('progressbar', { name: 'پیشرفت تحویل حضوری' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('۲ از ۴ مرحله')).toBeInTheDocument();
    expect(screen.getByLabelText('مراحل تحویل حضوری')).toBeInTheDocument();
    expect(screen.getByText('ثبت‌شده')).toBeInTheDocument();
    expect(screen.getByText('در حال آماده‌سازی')).toBeInTheDocument();
    expect(screen.getByText('آماده تحویل')).toBeInTheDocument();
    expect(screen.getByText('تحویل‌شده')).toBeInTheDocument();
  });

  it('still shows step titles in compact mode', () => {
    render(<PickupStatusStepper status="REQUESTED" compact />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByText('ثبت‌شده')).toBeInTheDocument();
    expect(screen.getByText('آماده تحویل')).toBeInTheDocument();
  });

  it('shows dates under reached steps', () => {
    render(
      <PickupStatusStepper
        status="PREPARING"
        compact
        stepAt={{
          REQUESTED: '2026-10-17T08:00:00.000Z',
          PREPARING: '2026-10-18T10:30:00.000Z',
        }}
      />,
    );
    const times = screen.getAllByRole('time');
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute('dateTime', '2026-10-17T08:00:00.000Z');
    expect(times[1]).toHaveAttribute('dateTime', '2026-10-18T10:30:00.000Z');
  });
});
