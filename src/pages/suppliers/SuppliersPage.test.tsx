import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey, Supplier } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { suppliersApi } from '@/services/suppliersApi';
import { t } from '@/i18n';
import SuppliersPage from './SuppliersPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const SUPPLIER_ID = 'a0530000-0000-4000-8000-000000000001';
const timestamp = '2026-10-11T09:00:00.000Z';

const supplier = (over: Partial<Supplier> = {}): Supplier => ({
  id: SUPPLIER_ID,
  name: 'شركة النيل للتجارة',
  phone: '01012345678',
  tax_registration_no: '123-456-789',
  address: 'القاهرة',
  payment_terms_days: 30,
  notes: null,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  balance: '1050.25',
  ...over,
});

function page(items: Supplier[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
async function supplierRow() {
  const table = await screen.findByRole('table', { name: t('suppliers.title') });
  return within(table).findByRole('row', { name: /01012345678/ });
}

describe('U01 suppliers page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['supplier.manage']);
    vi.spyOn(suppliersApi, 'list').mockResolvedValue(page([supplier()]));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists suppliers in Arabic with the old labels, LTR phone and a red balance owed', async () => {
    await renderApp(<SuppliersPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('suppliers.title') });
    for (const label of ['المورد', 'الهاتف', 'الرقم الضريبي', 'مدة السداد', 'المستحق للمورد']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await supplierRow();
    expect(within(row).getByText('شركة النيل للتجارة')).toBeInTheDocument();
    expect(within(row).getByText('01012345678')).toHaveAttribute('dir', 'ltr');
    expect(within(row).getByText('123-456-789')).toHaveAttribute('dir', 'ltr');
    expect(within(row).getByText('30 يوم')).toBeInTheDocument();
    expect(within(row).getByText('1,050.25 ج.م')).toHaveClass('text-danger-600');
    expect(within(row).getByRole('link', { name: 'شركة النيل للتجارة' })).toHaveAttribute(
      'href',
      `/suppliers/${SUPPLIER_ID}`,
    );
  });

  it('lists suppliers in English; a zero balance is not red and 0 terms read as cash', async () => {
    vi.spyOn(suppliersApi, 'list').mockResolvedValue(
      page([supplier({ name: 'Nile Traders', balance: '0.00', payment_terms_days: 0 })]),
    );
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const row = await supplierRow();
    expect(within(row).getByText('Nile Traders')).toBeInTheDocument();
    expect(within(row).getByText('Cash')).toBeInTheDocument();
    expect(within(row).getByText('0.00 EGP')).not.toHaveClass('text-danger-600');
    expect(within(row).getByText(t('suppliers.status.active'))).toBeInTheDocument();
  });

  it('sends the search and the status filter to the server', async () => {
    const list = vi.spyOn(suppliersApi, 'list');
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await supplierRow();
    expect(list).toHaveBeenLastCalledWith({ status: 'active', page: 1, pageSize: 20 });
    await user.type(screen.getByRole('searchbox', { name: t('suppliers.search') }), ' nile ');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'nile',
        status: 'active',
        page: 1,
        pageSize: 20,
      }),
    );
    await user.selectOptions(screen.getByLabelText(t('suppliers.statusFilter')), 'archived');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'nile',
        status: 'archived',
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it.each(['ar', 'en'] as const)('creates a supplier in %s with the trimmed body', async (lang) => {
    const create = vi.spyOn(suppliersApi, 'create').mockResolvedValue(supplier());
    await renderApp(<SuppliersPage />, { lang });
    const user = userEvent.setup();
    await supplierRow();
    await user.click(screen.getByRole('button', { name: t('suppliers.add') }));
    await user.type(screen.getByLabelText(t('suppliers.fields.name')), '  Delta Supply  ');
    await user.type(screen.getByLabelText(t('suppliers.fields.phone')), ' 010-1234 5678 ');
    await user.type(screen.getByLabelText(t('suppliers.fields.address')), ' Giza ');
    const terms = screen.getByLabelText(t('suppliers.fields.terms'));
    await user.clear(terms);
    await user.type(terms, '45');
    await user.click(screen.getByRole('button', { name: t('suppliers.save') }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toEqual({
      name: 'Delta Supply',
      phone: '01012345678',
      address: 'Giza',
      payment_terms_days: 45,
    });
  });

  it('refuses a bad phone before calling the server', async () => {
    const create = vi.spyOn(suppliersApi, 'create');
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await supplierRow();
    await user.click(screen.getByRole('button', { name: t('suppliers.add') }));
    await user.type(screen.getByLabelText(t('suppliers.fields.name')), 'X');
    await user.type(screen.getByLabelText(t('suppliers.fields.phone')), '12ab');
    await user.click(screen.getByRole('button', { name: t('suppliers.save') }));
    expect(await screen.findByText(t('suppliers.errors.phone'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows a taken name inline under the name field', async () => {
    vi.spyOn(suppliersApi, 'create').mockRejectedValue(
      new ApiError(409, 'SUPPLIER_NAME_TAKEN', 'Name taken.'),
    );
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await supplierRow();
    await user.click(screen.getByRole('button', { name: t('suppliers.add') }));
    await user.type(screen.getByLabelText(t('suppliers.fields.name')), 'nile traders');
    await user.click(screen.getByRole('button', { name: t('suppliers.save') }));

    expect(await screen.findByText(t('suppliers.errors.nameTaken'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('suppliers.fields.name'))).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('shows a taken phone inline under the phone field', async () => {
    vi.spyOn(suppliersApi, 'create').mockRejectedValue(
      new ApiError(409, 'SUPPLIER_PHONE_TAKEN', 'Phone taken.'),
    );
    await renderApp(<SuppliersPage />, { lang: 'ar' });
    const user = userEvent.setup();
    await supplierRow();
    await user.click(screen.getByRole('button', { name: t('suppliers.add') }));
    await user.type(screen.getByLabelText(t('suppliers.fields.name')), 'مورد');
    await user.type(screen.getByLabelText(t('suppliers.fields.phone')), '01012345678');
    await user.click(screen.getByRole('button', { name: t('suppliers.save') }));
    expect(await screen.findByText(t('suppliers.errors.phoneTaken'))).toBeInTheDocument();
  });

  it('edits with only the changed keys', async () => {
    const update = vi.spyOn(suppliersApi, 'update').mockResolvedValue(supplier());
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await supplierRow()).getByRole('button', { name: t('suppliers.editAction') }),
    );
    const address = screen.getByLabelText(t('suppliers.fields.address'));
    await user.clear(address);
    await user.type(address, 'Giza');
    await user.clear(screen.getByLabelText(t('suppliers.fields.phone')));
    await user.click(screen.getByRole('button', { name: t('suppliers.save') }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(SUPPLIER_ID, { phone: null, address: 'Giza' }),
    );
  });

  it('asks before deactivating and shows SUPPLIER_HAS_BALANCE translated', async () => {
    const archive = vi
      .spyOn(suppliersApi, 'archive')
      .mockRejectedValue(new ApiError(409, 'SUPPLIER_HAS_BALANCE', 'Has a balance.'));
    await renderApp(<SuppliersPage />, { lang: 'ar' });
    const user = userEvent.setup();
    await user.click(
      within(await supplierRow()).getByRole('button', { name: t('suppliers.archive') }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('suppliers.archiveConfirm'))).toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: t('suppliers.archive') }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith(SUPPLIER_ID));
    expect(await screen.findByText(t('suppliers.errors.hasBalance'))).toBeInTheDocument();
  });

  it('shows SUPPLIER_HAS_OPEN_DOCUMENTS translated', async () => {
    vi.spyOn(suppliersApi, 'archive').mockRejectedValue(
      new ApiError(409, 'SUPPLIER_HAS_OPEN_DOCUMENTS', 'Open documents.'),
    );
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await supplierRow()).getByRole('button', { name: t('suppliers.archive') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('suppliers.archive') }));
    expect(await screen.findByText(t('suppliers.errors.hasOpenDocuments'))).toBeInTheDocument();
  });

  it('restores an inactive supplier; a clash shows its message', async () => {
    vi.spyOn(suppliersApi, 'list').mockResolvedValue(
      page([supplier({ archived_at: timestamp, balance: '0.00' })]),
    );
    const restore = vi
      .spyOn(suppliersApi, 'restore')
      .mockRejectedValue(new ApiError(409, 'SUPPLIER_NAME_TAKEN', 'Name taken.'));
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const user = userEvent.setup();
    const row = await supplierRow();
    expect(within(row).getByText(t('suppliers.status.archived'))).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: t('suppliers.editAction') })).toBeDisabled();
    await user.click(within(row).getByRole('button', { name: t('suppliers.restore') }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(SUPPLIER_ID));
    expect(await screen.findByText(t('suppliers.errors.restoreNameTaken'))).toBeInTheDocument();
  });

  it('hides add, edit, deactivate and restore without supplier.manage', async () => {
    setPermissions(['purchase.invoice_create']);
    await renderApp(<SuppliersPage />, { lang: 'en' });
    const row = await supplierRow();
    expect(within(row).getByRole('button', { name: t('suppliers.statementAction') })).toBeVisible();
    expect(screen.queryByRole('button', { name: t('suppliers.add') })).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: t('suppliers.editAction') }),
    ).not.toBeInTheDocument();
    expect(
      within(row).queryByRole('button', { name: t('suppliers.archive') }),
    ).not.toBeInTheDocument();
  });
});
