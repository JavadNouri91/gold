'use client';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/alert';
import { TableSkeleton } from './states';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  isLoading,
  emptyMessage = 'موردی یافت نشد',
  page,
  totalPages,
  total,
  pageSize,
  pageSizeOptions = [10, 20, 50],
  onPageChange,
  onPageSizeChange,
  stickyHeader = false,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  page?: number;
  totalPages?: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  stickyHeader?: boolean;
  caption?: string;
}) {
  if (isLoading) return <TableSkeleton />;
  if (!rows.length) return <EmptyState message={emptyMessage} />;

  return (
    <div className="space-y-3">
      <div className={`overflow-auto rounded-xl border bg-white ${stickyHeader ? 'max-h-[640px]' : ''}`}>
        <table className="min-w-full text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className={`bg-muted/60 text-muted-foreground ${stickyHeader ? 'sticky top-0 z-10' : ''}`}>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-right font-medium whitespace-nowrap">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 align-middle ${column.className ?? ''}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onPageChange && page && totalPages && (totalPages > 1 || total != null) ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">
            {total != null && pageSize
              ? `نمایش ${Math.min((page - 1) * pageSize + 1, total).toLocaleString('fa-IR')} تا ${Math.min(page * pageSize, total).toLocaleString('fa-IR')} از ${total.toLocaleString('fa-IR')} مورد`
              : `صفحه ${page.toLocaleString('fa-IR')} از ${totalPages.toLocaleString('fa-IR')}`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {onPageSizeChange && pageSize ? (
              <label className="flex items-center gap-2 text-muted-foreground">
                تعداد در صفحه
                <select
                  className="h-8 rounded-md border bg-white px-2"
                  value={pageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size.toLocaleString('fa-IR')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              قبلی
            </Button>
            {Array.from({ length: totalPages }, (_, index) => index + 1)
              .filter((number) => number === 1 || number === totalPages || Math.abs(number - page) <= 1)
              .map((number, index, list) => {
                const previous = list[index - 1];
                return (
                  <span key={number} className="flex items-center gap-2">
                    {previous && number - previous > 1 ? <span className="text-muted-foreground">…</span> : null}
                    <Button
                      variant={number === page ? 'default' : 'outline'}
                      size="sm"
                      aria-current={number === page ? 'page' : undefined}
                      onClick={() => onPageChange(number)}
                    >
                      {number.toLocaleString('fa-IR')}
                    </Button>
                  </span>
                );
              })}
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
