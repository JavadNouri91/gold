import { render, screen } from '@testing-library/react';
import {
  PickupStatusStepper,
  cancelledReachedIndex,
} from '@/components/portal/pickups/pickup-status-stepper';

describe('PickupStatusStepper', () => {
  it('shows step labels for CANCELLED instead of only a red chip', () => {
    render(
      <PickupStatusStepper
        status="CANCELLED"
        stepAt={{
          REQUESTED: '2026-10-17T08:00:00.000Z',
          PREPARING: '2026-10-18T10:30:00.000Z',
        }}
      />,
    );
    expect(screen.getAllByText('ثبت‌شده').length).toBeGreaterThan(0);
    expect(screen.getAllByText('در حال آماده‌سازی').length).toBeGreaterThan(0);
    expect(screen.getAllByText('آماده تحویل').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تحویل‌شده').length).toBeGreaterThan(0);
  });

  it('renders a progress bar with four labeled steps', () => {
    render(<PickupStatusStepper status="PREPARING" />);
    const bar = screen.getByRole('progressbar', { name: 'پیشرفت تحویل حضوری' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    expect(screen.getByText('۲ از ۴ مرحله')).toBeInTheDocument();
    expect(screen.getAllByLabelText('مراحل تحویل حضوری').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ثبت‌شده').length).toBeGreaterThan(0);
    expect(screen.getAllByText('در حال آماده‌سازی').length).toBeGreaterThan(0);
    expect(screen.getAllByText('آماده تحویل').length).toBeGreaterThan(0);
    expect(screen.getAllByText('تحویل‌شده').length).toBeGreaterThan(0);
  });

  it('still shows step titles in compact mode', () => {
    render(<PickupStatusStepper status="REQUESTED" compact />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getAllByText('ثبت‌شده').length).toBeGreaterThan(0);
    expect(screen.getAllByText('آماده تحویل').length).toBeGreaterThan(0);
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
    // Mobile + desktop steppers both render reached dates
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times[0]).toHaveAttribute('dateTime', '2026-10-17T08:00:00.000Z');
  });

  it('freezes cancelled progress at the last reached step', () => {
    expect(
      cancelledReachedIndex({
        REQUESTED: '2026-10-17T08:00:00.000Z',
        PREPARING: '2026-10-18T10:30:00.000Z',
      }),
    ).toBe(1);
    expect(
      cancelledReachedIndex({
        REQUESTED: '2026-10-17T08:00:00.000Z',
        PREPARING: '2026-10-18T10:30:00.000Z',
        READY: '2026-10-19T12:00:00.000Z',
      }),
    ).toBe(2);
    expect(cancelledReachedIndex({ REQUESTED: '2026-10-17T08:00:00.000Z' })).toBe(0);
  });
});
