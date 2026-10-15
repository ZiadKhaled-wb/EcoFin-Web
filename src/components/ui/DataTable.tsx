import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { ChevronDownIcon, ChevronEndIcon, ChevronStartIcon } from '@/components/ui/Icons';
import LoadingState from '@/components/ui/LoadingState';
import SearchInput from '@/components/ui/SearchInput';
import Select, { type SelectOption } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { t } from '@/i18n';

declare module '@tanstack/react-table' {
  // The generics must match the library's own declaration to merge, so both are used below.
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Money, quantities, codes: end-aligned, tabular, LTR-isolated (`.num`). */
    numeric?: boolean;
    /**
     * Free text (a note, a reason): wraps onto more lines. Other columns stay on one line on a
     * phone and the table scrolls sideways, so a name doesn't break word by word.
     */
    wrap?: boolean;
    /** Type-only marker so the merged declaration uses both generics. Never set at runtime. */
    readonly types?: { row: TData; value: TValue };
  }
}

/**
 * Server-driven mode. `page`, `pageSize` and `total` are the contract's paginated response
 * (`paginated()` in @ziadkhaled-wb/contracts). Pass `sorting`/`onSortingChange` and
 * `search`/`onSearchChange` too when the server sorts and searches.
 */
export interface ServerMode {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Accessible name of the table. */
  caption: string;
  getRowId?: (row: T) => string;
  /** Extra classes for one row (for example to grey out an inactive record). */
  rowClassName?: (row: T) => string | undefined;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  /** Shown when there are no rows at all. Say what to do next. */
  empty?: { title: string; description?: string; action?: ReactNode };
  /** Search box over every column (client mode) or `server.onSearchChange` (server mode). */
  searchable?: boolean;
  /** A select that filters one column by equality (client mode). */
  filter?: { columnId: string; label: string; options: SelectOption[] };
  /** Rows per page in client mode. */
  pageSize?: number;
  server?: ServerMode;
}

export default function DataTable<T>({
  columns,
  data,
  caption,
  getRowId,
  rowClassName,
  loading,
  error,
  onRetry,
  empty,
  searchable,
  filter,
  pageSize = 10,
  server,
}: DataTableProps<T>) {
  const [sortingState, setSortingState] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize });

  const onServerSort = server?.onSortingChange;
  const onServerSearch = server?.onSearchChange;
  const sorting = onServerSort ? (server.sorting ?? []) : sortingState;
  const search = onServerSearch ? (server.search ?? '') : globalFilter;

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: {
      sorting,
      globalFilter: onServerSearch ? undefined : globalFilter,
      columnFilters,
      pagination: server ? { pageIndex: server.page - 1, pageSize: server.pageSize } : pagination,
    },
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      if (onServerSort) onServerSort(next);
      else setSortingState(next);
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: onServerSort ? undefined : getSortedRowModel(),
    getFilteredRowModel: onServerSearch ? undefined : getFilteredRowModel(),
    ...(server
      ? {
          manualPagination: true,
          pageCount: Math.max(1, Math.ceil(server.total / server.pageSize)),
        }
      : { getPaginationRowModel: getPaginationRowModel(), autoResetPageIndex: true }),
    manualSorting: !!onServerSort,
    manualFiltering: !!onServerSearch,
  });

  const filterValue = filter
    ? ((columnFilters.find((f) => f.id === filter.columnId)?.value as string | undefined) ?? '')
    : '';
  const filterActive = !!search || !!filterValue;

  const pageIndex = server ? server.page - 1 : table.getState().pagination.pageIndex;
  const pageCount = table.getPageCount();
  const totalRows = server ? server.total : table.getFilteredRowModel().rows.length;
  const goToPage = (index: number) =>
    server ? server.onPageChange(index + 1) : table.setPageIndex(index);

  const rows = table.getRowModel().rows;
  const showToolbar = searchable || filter;

  let body: ReactNode;
  if (error) body = <ErrorState onRetry={onRetry} />;
  else if (loading) body = <LoadingState />;
  else if (!rows.length) {
    body =
      filterActive || !empty ? (
        <EmptyState title={t('table.noResults')} description={t('table.noResultsHint')} />
      ) : (
        <EmptyState {...empty} />
      );
  } else {
    body = (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-line bg-paper">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const numeric = header.column.columnDef.meta?.numeric;
                  const sorted = header.column.getIsSorted();
                  const name =
                    typeof header.column.columnDef.header === 'string'
                      ? header.column.columnDef.header
                      : header.column.id;
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : undefined
                      }
                      className={cn(
                        'type-label whitespace-nowrap px-4 py-3',
                        numeric ? 'text-end' : 'text-start',
                      )}
                    >
                      {header.column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          aria-label={t('table.sortBy', { column: name })}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-control hover:text-brand-700"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted && (
                            <ChevronDownIcon
                              size={16}
                              className={cn(sorted === 'asc' && 'rotate-180')}
                            />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  'border-b border-line last:border-b-0 hover:bg-paper',
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  // `.num` is inline-block (LTR isolation for digits); on the <td> itself it would
                  // take the cell out of the table layout, so it wraps the content instead.
                  return cell.column.columnDef.meta?.numeric ? (
                    <td key={cell.id} className="type-body whitespace-nowrap px-4 py-3 text-end">
                      <span className="num">{content}</span>
                    </td>
                  ) : (
                    <td
                      key={cell.id}
                      className={cn(
                        'type-body px-4 py-3 text-start',
                        cell.column.columnDef.meta?.wrap
                          ? 'max-sm:min-w-48'
                          : 'max-sm:whitespace-nowrap',
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Card padded={false}>
      {showToolbar && (
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          {searchable && (
            <div className="min-w-48 flex-1">
              <SearchInput
                label={t('table.search')}
                value={search}
                onValueChange={(v) => {
                  if (onServerSearch) onServerSearch(v);
                  else setGlobalFilter(v);
                }}
              />
            </div>
          )}
          {filter && (
            <div className="min-w-40">
              <Select
                label={filter.label}
                value={filterValue}
                placeholder={t('table.filterAll')}
                options={filter.options}
                onChange={(e) =>
                  table.getColumn(filter.columnId)?.setFilterValue(e.target.value || undefined)
                }
              />
            </div>
          )}
        </div>
      )}

      {body}

      {!error && !loading && rows.length > 0 && (
        <nav
          aria-label={t('table.pagination')}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4"
        >
          <p className="type-caption">
            {t('table.pageOf', {
              page: formatNumber(String(pageIndex + 1)),
              pages: formatNumber(String(pageCount)),
            })}
            {' · '}
            {t('table.total', { total: formatNumber(String(totalRows)) })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon={<ChevronStartIcon />}
              disabled={pageIndex <= 0}
              onClick={() => goToPage(pageIndex - 1)}
            >
              {t('table.previous')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => goToPage(pageIndex + 1)}
            >
              {t('table.next')}
              <ChevronEndIcon />
            </Button>
          </div>
        </nav>
      )}
    </Card>
  );
}
