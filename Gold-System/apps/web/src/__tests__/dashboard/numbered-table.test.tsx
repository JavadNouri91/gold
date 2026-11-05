import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable, type Column } from '@/components/dashboard/data-table';
import { NumberedTable } from '@/components/dashboard/numbered-table';

const rows = [
  { id: 'z', name: 'زهرا' },
  { id: 'a', name: 'علی' },
];
const columns: Column<(typeof rows)[number]>[] = [
  { key: 'id', header: 'شناسه', render: (row) => row.id },
  { key: 'name', header: 'نام', render: (row) => row.name },
];

function numbers() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);
}

describe('admin row numbering', () => {
  it('uses page metadata and recalculates after sorting, filtering, search, and page-size changes', () => {
    const { rerender } = render(<DataTable columns={columns} rows={rows} page={2} pageSize={10} />);
    expect(numbers()).toEqual(['۱۱', '۱۲']);
    rerender(<DataTable columns={columns} rows={[...rows].reverse()} page={3} pageSize={10} />);
    expect(numbers()).toEqual(['۲۱', '۲۲']);
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell')[1]).toHaveTextContent('a');
    rerender(<DataTable columns={columns} rows={[rows[1]]} page={1} pageSize={10} />);
    expect(numbers()).toEqual(['۱']);
    rerender(<DataTable columns={columns} rows={rows} page={2} pageSize={50} />);
    expect(numbers()).toEqual(['۵۱', '۵۲']);
  });

  it('places numbers after selection in RTL without changing checkbox behavior', async () => {
    const onSelect = jest.fn();
    const selection: Column<(typeof rows)[number]> = {
      key: 'select',
      header: <input type="checkbox" aria-label="همه" />,
      render: (row) => (
        <input type="checkbox" aria-label={row.id} onChange={() => onSelect(row.id)} />
      ),
    };
    render(
      <div dir="rtl">
        <DataTable columns={[selection, ...columns]} rows={rows} />
      </div>,
    );
    const headers = screen.getAllByRole('columnheader');
    expect(within(headers[0]).getByRole('checkbox')).toBeInTheDocument();
    expect(headers[1]).toHaveTextContent('ردیف');
    expect(headers[1]).toHaveClass('w-12', 'px-2', 'text-center');
    expect(headers[2]).toHaveTextContent('شناسه');
    expect(screen.getByRole('table').closest('[dir]')).toHaveAttribute('dir', 'rtl');
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'z' }));
    expect(onSelect).toHaveBeenCalledWith('z');
  });

  it('preserves empty states and does not number full-width placeholder rows', () => {
    const { rerender } = render(<DataTable columns={columns} rows={[]} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    rerender(
      <NumberedTable>
        <thead>
          <tr>
            <th>شناسه</th>
            <th>نام</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={2}>خالی</td>
          </tr>
        </tbody>
      </NumberedTable>,
    );
    expect(screen.getByRole('cell', { name: 'خالی' })).toHaveAttribute('colspan', '3');
    expect(screen.getAllByRole('cell')).toHaveLength(1);
  });

  it('supports offset-based native tables and preserves existing numbering', () => {
    const { rerender } = render(
      <NumberedTable offset={18}>
        <thead>
          <tr>
            <th>شناسه</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
            </tr>
          ))}
        </tbody>
      </NumberedTable>,
    );
    expect(numbers()).toEqual(['۱۹', '۲۰']);
    rerender(
      <NumberedTable>
        <thead>
          <tr>
            <th>ردیف</th>
            <th>شناسه</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>۱</td>
            <td>z</td>
          </tr>
        </tbody>
      </NumberedTable>,
    );
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(numbers()).toEqual(['۱']);
  });
});
