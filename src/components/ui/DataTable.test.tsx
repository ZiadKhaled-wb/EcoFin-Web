import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { describe, expect, it, vi } from 'vitest';
import DataTable from '@/components/ui/DataTable';
import { t } from '@/i18n';
import { renderApp } from '@/test/renderApp';

type Row = { id: string; name: string; qty: string };
const rows: Row[] = ['delta', 'alpha', 'charlie', 'bravo', 'echo', 'foxtrot', 'golf'].map(
  (name, i) => ({ id: String(i), name, qty: String(i * 10) }),
);
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'qty', header: 'Qty', meta: { numeric: true } },
];
const names = () =>
  within(screen.getAllByRole('rowgroup')[1]!)
    .getAllByRole('row')
    .map((r) => within(r).getAllByRole('cell')[0]!.textContent);

describe('DataTable (client mode)', () => {
  it('sorts when the header is pressed', async () => {
    const user = userEvent.setup();
    await renderApp(<DataTable caption="people" columns={columns} data={rows} pageSize={10} />, {
      lang: 'en',
    });
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(names()).toEqual(['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf']);
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(names()[0]).toBe('golf');
  });

  it('keeps numeric cells in the table layout (the inline-block .num wraps the content)', async () => {
    await renderApp(<DataTable caption="people" columns={columns} data={rows} pageSize={10} />, {
      lang: 'en',
    });
    const cell = within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('cell')[1]!;
    expect(cell).not.toHaveClass('num');
    expect(cell).toHaveClass('text-end');
    expect(cell.querySelector('span.num')).toHaveTextContent('0');
    expect(screen.getByRole('columnheader', { name: /Qty/ })).toHaveClass('text-end');
  });

  it('on a phone keeps headers and short cells on one line; a wrap column wraps', async () => {
    type Note = { id: string; name: string; note: string };
    const noteColumns: ColumnDef<Note, unknown>[] = [
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'note', header: 'Note', meta: { wrap: true } },
    ];
    await renderApp(
      <DataTable
        caption="notes"
        columns={noteColumns}
        data={[{ id: '1', name: 'Mohamed Ahmed', note: 'a long note about the count' }]}
      />,
      { lang: 'en' },
    );
    const [name, note] = within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('cell');
    expect(name).toHaveClass('max-sm:whitespace-nowrap');
    expect(note).not.toHaveClass('max-sm:whitespace-nowrap');
    expect(note).toHaveClass('max-sm:min-w-48');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveClass('whitespace-nowrap');
  });

  it('searches, then shows the no-results state', async () => {
    const user = userEvent.setup();
    await renderApp(
      <DataTable caption="people" columns={columns} data={rows} searchable pageSize={10} />,
      { lang: 'en' },
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search the table' }), 'ra');
    expect(names()).toEqual(['bravo']);
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No matching results')).toBeInTheDocument();
  });

  it('paginates', async () => {
    const user = userEvent.setup();
    await renderApp(<DataTable caption="people" columns={columns} data={rows} pageSize={3} />, {
      lang: 'en',
    });
    expect(names()).toHaveLength(3);
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Previous/ })).toBeEnabled();
  });

  it('shows loading, error with retry, and the empty state', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = await renderApp(
      <DataTable caption="p" columns={columns} data={[]} loading />,
      { lang: 'en' },
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<DataTable caption="p" columns={columns} data={[]} error onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: t('ui.retry') }));
    expect(onRetry).toHaveBeenCalled();
    rerender(
      <DataTable caption="p" columns={columns} data={[]} empty={{ title: 'Nothing yet' }} />,
    );
    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
  });
});

describe('DataTable (server mode)', () => {
  it('uses the contract pagination shape and asks the caller for another page', async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    await renderApp(
      <DataTable
        caption="people"
        columns={columns}
        data={rows.slice(0, 3)}
        server={{ page: 2, pageSize: 3, total: 7, onPageChange }}
      />,
      { lang: 'en' },
    );
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText(/7 rows/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole('button', { name: /Previous/ }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('hands sorting and search to the server', async () => {
    const onSortingChange = vi.fn();
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    await renderApp(
      <DataTable
        caption="people"
        columns={columns}
        data={rows.slice(0, 3)}
        searchable
        server={{
          page: 1,
          pageSize: 3,
          total: 7,
          onPageChange: vi.fn(),
          sorting: [],
          onSortingChange,
          search: '',
          onSearchChange,
        }}
      />,
      { lang: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Sort by Name' }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: 'name', desc: false }]);
    await user.type(screen.getByRole('searchbox'), 'a');
    expect(onSearchChange).toHaveBeenCalledWith('a');
  });
});
