import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Category } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { notify } from '@/components/ui/notify';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { categoriesApi } from '@/services/categoriesApi';
import { t } from '@/i18n';
import CategoriesPage from './CategoriesPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const PARENT_ID = 'a0500000-0000-4000-8000-000000000001';
const CHILD_ID = 'a0500000-0000-4000-8000-000000000002';
const TARGET_ID = 'a0500000-0000-4000-8000-000000000003';
const timestamp = '2026-10-07T09:00:00.000Z';
const category = (over: Partial<Category> = {}): Category => ({
  id: PARENT_ID,
  name: 'Furniture',
  parent_id: null,
  archived_at: null,
  active_product_count: 0,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});
function rowForCategory(table: HTMLElement, name: string) {
  const row = within(table)
    .getAllByRole('row')
    .slice(1)
    .find((candidate) => within(candidate).getAllByRole('cell')[0]?.textContent === name);
  if (!row) throw new Error(`Category row not found: ${name}`);
  return row;
}

describe('C01 categories page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['catalog.manage']));
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([category()]);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists children indented under parents and shows the parent name', async () => {
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      category(),
      category({ id: CHILD_ID, name: 'Chairs', parent_id: PARENT_ID }),
    ]);
    await renderApp(<CategoriesPage />, { lang: 'en' });

    const table = await screen.findByRole('table', { name: t('categories.title') });
    expect(rowForCategory(table, 'Furniture')).toBeInTheDocument();
    const childRow = within(table).getByRole('row', { name: /Chairs/ });
    expect(within(childRow).getByText('Furniture')).toBeInTheDocument();
    expect(childRow.querySelector('span')).toHaveClass('ms-5');
  });

  it.each(['ar', 'en'] as const)('creates a category in %s', async (lang) => {
    const create = vi
      .spyOn(categoriesApi, 'create')
      .mockResolvedValue(category({ name: 'Tables' }));
    await renderApp(<CategoriesPage />, { lang });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('categories.add') }));
    await user.type(screen.getByLabelText(t('categories.name')), ' Tables ');
    await user.click(screen.getByRole('button', { name: t('categories.save') }));

    expect(create).toHaveBeenCalledWith({ name: 'Tables', parent_id: null });
  });

  it('shows duplicate category names under the name field', async () => {
    vi.spyOn(categoriesApi, 'create').mockRejectedValue(
      new ApiError(409, 'CATEGORY_NAME_TAKEN', 'Duplicate category.'),
    );
    await renderApp(<CategoriesPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('categories.add') }));
    await user.type(screen.getByLabelText(t('categories.name')), 'Furniture');
    await user.click(screen.getByRole('button', { name: t('categories.save') }));

    expect(await screen.findByText(t('categories.nameTaken'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('categories.name'))).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers to move active products before archiving', async () => {
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      category({ active_product_count: 2 }),
      category({ id: TARGET_ID, name: 'Other' }),
    ]);
    const archive = vi
      .spyOn(categoriesApi, 'archive')
      .mockResolvedValue(category({ archived_at: timestamp }));
    await renderApp(<CategoriesPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('categories.title') });
    const row = rowForCategory(table, 'Furniture');
    await user.click(within(row).getByRole('button', { name: t('categories.archive') }));
    await user.selectOptions(screen.getByLabelText(t('categories.moveProducts')), TARGET_ID);
    await user.click(screen.getByRole('button', { name: t('categories.archiveMove') }));

    expect(archive).toHaveBeenCalledWith(PARENT_ID, { move_to_category_id: TARGET_ID });
  });

  it('shows active child counts and does not offer an archive confirmation', async () => {
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      category({ active_product_count: 2 }),
      category({ id: CHILD_ID, name: 'Chairs', parent_id: PARENT_ID }),
    ]);
    const archive = vi.spyOn(categoriesApi, 'archive');
    await renderApp(<CategoriesPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('categories.title') });
    const row = rowForCategory(table, 'Furniture');
    await user.click(within(row).getByRole('button', { name: t('categories.archive') }));

    expect(
      await screen.findByText(t('categories.activeProductsCount', { count: 2 })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('categories.activeChildrenCount', { count: 1 }))).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('categories.archiveMove') }),
    ).not.toBeInTheDocument();
    expect(archive).not.toHaveBeenCalled();
  });

  it('maps CATEGORY_IN_USE details to a translated archive message', async () => {
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([
      category({ active_product_count: 1 }),
      category({ id: TARGET_ID, name: 'Other' }),
    ]);
    const conflict = new ApiError(409, 'CATEGORY_IN_USE', 'Category is in use.');
    conflict.details = { active_products: 1, active_children: 0 };
    vi.spyOn(categoriesApi, 'archive').mockRejectedValue(conflict);
    await renderApp(<CategoriesPage />, { lang: 'en' });
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: t('categories.title') });
    await user.click(
      within(rowForCategory(table, 'Furniture')).getByRole('button', {
        name: t('categories.archive'),
      }),
    );
    await user.selectOptions(screen.getByLabelText(t('categories.moveProducts')), TARGET_ID);
    await user.click(screen.getByRole('button', { name: t('categories.archiveMove') }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('categories.archiveRefused', { products: 1, children: 0 }),
    );
  });

  it('shows a translated error when restoring under an archived parent', async () => {
    const restore = vi
      .spyOn(categoriesApi, 'restore')
      .mockRejectedValue(new ApiError(409, 'CATEGORY_PARENT_ARCHIVED', 'Parent is archived.'));
    const toastError = vi.spyOn(notify, 'error');
    vi.spyOn(categoriesApi, 'list').mockResolvedValue([category({ archived_at: timestamp })]);
    await renderApp(<CategoriesPage />, { lang: 'ar' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('categories.restore') }));

    expect(restore).toHaveBeenCalledWith(PARENT_ID);
    expect(toastError).toHaveBeenCalledWith(t('categories.parentArchived'));
  });

  it('hides write controls without catalog.manage', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture([]));
    await renderApp(<CategoriesPage />, { lang: 'en' });

    expect(await screen.findByText('Furniture')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('categories.add') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('categories.edit') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('categories.archive') })).not.toBeInTheDocument();
  });
});
