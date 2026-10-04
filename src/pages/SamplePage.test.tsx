import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import SamplePage from '@/pages/SamplePage';
import { setLanguage, t, type Language } from '@/i18n';
import { renderApp } from '@/test/renderApp';

afterEach(async () => {
  await setLanguage('ar');
  window.localStorage.clear();
});

const bodyRows = () => within(screen.getAllByRole('rowgroup')[1]!).getAllByRole('row');

describe.each<[Language, 'rtl' | 'ltr']>([
  ['ar', 'rtl'],
  ['en', 'ltr'],
])('SamplePage in %s', (lang, dir) => {
  it('renders translated, with the right direction, and every shared component works', async () => {
    const user = userEvent.setup();
    await renderApp(<SamplePage />, { lang });

    // Direction and language on <html>, translated strings, no raw keys.
    expect(document.documentElement.dir).toBe(dir);
    expect(document.documentElement.lang).toBe(lang);
    expect(screen.getByRole('heading', { level: 1, name: t('sample.title') })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\b(sample|shell|table|form)\.[a-z]+\./);

    // Data table: rows, money formatted from a decimal string, pagination.
    expect(bodyRows()).toHaveLength(5);
    expect(
      within(bodyRows()[0]!).getByText(`1,000.50 ${t('common.currency')}`),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('table.next') }));
    expect(
      screen.getByText(t('table.pageOf', { page: '2', pages: '5' }), { exact: false }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: t('table.previous') }));

    // Sort (price, descending: two clicks).
    const sortPrice = screen.getByRole('button', {
      name: t('table.sortBy', { column: t('sample.table.price') }),
    });
    await user.click(sortPrice);
    await user.click(sortPrice);
    expect(
      within(bodyRows()[0]!).getByText(`3,750.50 ${t('common.currency')}`),
    ).toBeInTheDocument();

    // Filter by status, then search.
    await user.selectOptions(screen.getByLabelText(t('sample.table.statusFilter')), 'draft');
    expect(
      within(screen.getAllByRole('rowgroup')[1]!).queryByText(t('sample.table.active')),
    ).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(t('sample.table.statusFilter')), '');
    await user.type(screen.getByRole('searchbox', { name: t('table.search') }), 'Sofa 3');
    expect(bodyRows().length).toBeGreaterThan(0);
    expect(within(bodyRows()[0]!).getByText('Sofa 3')).toBeInTheDocument();

    // Form validated by the contract schema: translated errors, never the English contract text.
    await user.click(screen.getByRole('button', { name: t('sample.form.submit') }));
    expect(await screen.findAllByText(t('form.errors.required'))).not.toHaveLength(0);
    await user.type(screen.getByLabelText(t('sample.form.currentPassword')), 'old-password');
    await user.type(screen.getByLabelText(t('sample.form.newPassword')), 'short');
    await user.click(screen.getByRole('button', { name: t('sample.form.submit') }));
    expect(await screen.findByText(t('form.errors.tooShort', { min: 8 }))).toBeInTheDocument();
    expect(screen.queryByText(/must contain at least/i)).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText(t('sample.form.newPassword')));
    await user.type(screen.getByLabelText(t('sample.form.newPassword')), 'long-enough-1');
    await user.click(screen.getByRole('button', { name: t('sample.form.submit') }));
    // Toast
    expect(await screen.findByText(t('sample.form.success'))).toBeInTheDocument();

    // Dialog
    await user.click(screen.getByRole('button', { name: t('sample.dialog.open') }));
    const dialog = await screen.findByRole('dialog', { name: t('sample.dialog.title') });
    await user.click(within(dialog).getByRole('button', { name: t('ui.confirm') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(t('sample.dialog.confirmed'))).toBeInTheDocument();
  });

  it('shows the loading, empty and error states', async () => {
    const user = userEvent.setup();
    await renderApp(<SamplePage />, { lang });

    await user.click(screen.getByRole('button', { name: t('sample.states.loading') }));
    expect(screen.getByRole('status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('sample.states.empty') }));
    expect(screen.getByText(t('sample.table.emptyTitle'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('sample.table.emptyAction') })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('sample.states.error') }));
    expect(screen.getByRole('alert')).toHaveTextContent(t('ui.errorTitle'));
    await user.click(screen.getByRole('button', { name: t('ui.retry') }));
    expect(bodyRows()).toHaveLength(5);
  });
});
