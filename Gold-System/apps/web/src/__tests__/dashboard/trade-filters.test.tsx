import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeFilterBar, EMPTY_TRADE_FILTERS, type TradeFilterValues } from '@/components/dashboard/trade-filter-bar';

jest.mock('@/components/ui/date-picker-jalali', () => ({
  DatePickerJalali: ({
    label,
    value,
    onChange,
  }: {
    label?: string;
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <div>
      <label>{label}</label>
      <input
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  ),
}));

/** Mirrors the page: holds the applied value and re-renders on change. */
function Harness({
  onChange,
  onReset,
}: {
  onChange: (values: TradeFilterValues) => void;
  onReset: () => void;
}) {
  const [value, setValue] = useState<TradeFilterValues>(EMPTY_TRADE_FILTERS);
  return (
    <TradeFilterBar
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onReset={onReset}
    />
  );
}

describe('TradeFilterBar', () => {
  it('renders all filter controls plus reset, without an apply button', () => {
    render(<TradeFilterBar value={EMPTY_TRADE_FILTERS} onChange={jest.fn()} onReset={jest.fn()} />);

    expect(screen.getByRole('group', { name: 'نوع معامله' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'همه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'خرید' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فروش' })).toBeInTheDocument();
    expect(screen.getByLabelText('جستجوی مشتری')).toBeInTheDocument();
    expect(screen.getByLabelText('وضعیت')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /اعمال فیلتر/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /پاک کردن/ })).toBeInTheDocument();
  });

  it('applies the side live', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<Harness onChange={onChange} onReset={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'خرید' }));

    expect(onChange).toHaveBeenLastCalledWith<[TradeFilterValues]>({
      side: 'BUY',
      status: '',
      q: '',
      from: '',
      to: '',
    });
  });

  it('applies the customer search live', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<Harness onChange={onChange} onReset={jest.fn()} />);

    await user.type(screen.getByLabelText('جستجوی مشتری'), 'علی');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'علی' }));
  });

  it('applies the selected status live', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<Harness onChange={onChange} onReset={jest.fn()} />);

    await user.selectOptions(screen.getByLabelText('وضعیت'), 'CONFIRMED');

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'CONFIRMED' }));
  });

  it('shows an alert when the start date is after the end date', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();

    render(<Harness onChange={onChange} onReset={jest.fn()} />);

    await user.type(screen.getByLabelText('از تاریخ'), '2026-10-20');
    await user.type(screen.getByLabelText('تا تاریخ'), '2026-10-01');

    expect(screen.getByRole('alert')).toHaveTextContent('تاریخ شروع باید پیش از تاریخ پایان باشد.');
  });

  it('calls onReset when reset is clicked', async () => {
    const user = userEvent.setup();
    const onReset = jest.fn();

    render(<Harness onChange={jest.fn()} onReset={onReset} />);

    await user.click(screen.getByRole('button', { name: /پاک کردن/ }));
    expect(onReset).toHaveBeenCalled();
  });
});
