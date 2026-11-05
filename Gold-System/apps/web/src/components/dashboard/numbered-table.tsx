import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type TableHTMLAttributes,
} from 'react';
import { cn, toPersianDigits } from '@/lib/utils';

const numberClassName = 'w-12 px-2 text-center tabular-nums';

type ElementProps = { children?: ReactNode; colSpan?: number };

/** Adds presentation-only numbering to native admin tables without changing record data. */
export function NumberedTable({
  children,
  page = 1,
  pageSize = 0,
  offset = (page - 1) * pageSize,
  selectionColumn = false,
  numberCellClassName,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & {
  page?: number;
  pageSize?: number;
  offset?: number;
  selectionColumn?: boolean;
  numberCellClassName?: string;
}) {
  let rowIndex = 0;
  const sections = Children.toArray(children);
  const hasNumber = sections.some(
    (section) =>
      isValidElement<ElementProps>(section) &&
      section.type === 'thead' &&
      Children.toArray(section.props.children).some(
        (row) =>
          isValidElement<ElementProps>(row) &&
          Children.toArray(row.props.children).some(
            (cell) => isValidElement<ElementProps>(cell) && cell.props.children === 'ردیف',
          ),
      ),
  );
  if (hasNumber) return <table {...props}>{children}</table>;

  return (
    <table {...props}>
      {sections.map((section) => {
        if (
          !isValidElement<ElementProps>(section) ||
          !['thead', 'tbody'].includes(String(section.type))
        )
          return section;
        const header = section.type === 'thead';
        return cloneElement(
          section,
          {},
          Children.map(section.props.children, (row) => {
            if (!isValidElement<ElementProps>(row) || row.type !== 'tr') return row;
            const cells = Children.toArray(row.props.children);
            // Empty-state and group rows span the table; they are not records.
            if (
              cells.length === 1 &&
              isValidElement<ElementProps>(cells[0]) &&
              (cells[0].props.colSpan ?? 1) > 1
            ) {
              return cloneElement(
                row,
                {},
                cloneElement(cells[0], { colSpan: cells[0].props.colSpan! + 1 }),
              );
            }
            const numberCell = header ? (
              <th
                key="rowNumber"
                scope="col"
                className={`${numberClassName} py-2 font-medium whitespace-nowrap border-b border-border`}
              >
                ردیف
              </th>
            ) : (
              <td
                key="rowNumber"
                className={cn(numberClassName, 'py-2 align-middle', numberCellClassName)}
              >
                {toPersianDigits(String(offset + rowIndex++ + 1))}
              </td>
            );
            cells.splice(selectionColumn ? 1 : 0, 0, numberCell as ReactElement);
            return cloneElement(row, {}, cells);
          }),
        );
      })}
    </table>
  );
}
