import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Customer, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { customersApi } from '@/services/customersApi';
import { t } from '@/i18n';
import CustomersPage from './CustomersPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0630000-0000-4000-8000-000000000001';
const OTHER_ID = 'a0630000-0000-4000-8000-000000000002';
const NATIONAL_ID = '29001010100015';
const timestamp = '2026-10-12T09:00:00.000Z';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: CUSTOMER_ID,
  full_name: 'أحمد علي حسن',
  phones: ['01001234567', '0223456789'],
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: '1990-01-01',
  gender: 'male',
  governorate_code: '01',
  address: '12 شارع التحرير',
  city: 'القاهرة',
  job: null,
  employer: null,
  monthly_income: '8500.50',
  is_business: false,
  tax_registration_no: null,
  status: 'active',
  notes: null,
  id_photos_count: 0,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});

function page(items: Customer[]) {
  return { items, page: 1, pageSize: 20, total: items.length };
}
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
async function customerRow() {
  const table = await screen.findByRole('table', { name: t('customers.title') });
  return within(table).findByRole('row', { name: /01001234567/ });
}
async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  await customerRow();
  await user.click(screen.getByRole('button', { name: t('customers.add') }));
}

describe('R01 customers page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['customer.create', 'customer.edit']);
    vi.spyOn(customersApi, 'list').mockResolvedValue(page([customer()]));
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists customers in Arabic: the masked ID as the server sent it, LTR phone, status', async () => {
    await renderApp(<CustomersPage />, { lang: 'ar' });
    const table = await screen.findByRole('table', { name: t('customers.title') });
    for (const label of ['العميل', 'الهاتف', 'الرقم القومي', 'المدينة', 'الدخل الشهري', 'الحالة']) {
      expect(within(table).getByRole('columnheader', { name: label })).toBeInTheDocument();
    }
    const row = await customerRow();
    expect(within(row).getByRole('link', { name: 'أحمد علي حسن' })).toHaveAttribute(
      'href',
      `/customers/${CUSTOMER_ID}`,
    );
    expect(within(row).getByText('01001234567')).toHaveAttribute('dir', 'ltr');
    expect(within(row).getByText('+1 أخرى')).toBeInTheDocument();
    expect(within(row).getByText('**********0015')).toHaveAttribute('dir', 'ltr');
    expect(within(row).getByText('8,500.50 ج.م')).toBeInTheDocument();
    expect(within(row).getByText('نشط')).toBeInTheDocument();
    expect(row.textContent).not.toMatch(/\d{14}/);
  });

  it('lists in English: the full ID when the server sent it, blocked and company badges', async () => {
    vi.spyOn(customersApi, 'list').mockResolvedValue(
      page([
        customer({
          full_name: 'Delta Trading',
          national_id: NATIONAL_ID,
          status: 'blocked',
          is_business: true,
          phones: ['01001234567'],
        }),
      ]),
    );
    await renderApp(<CustomersPage />, { lang: 'en' });
    const row = await customerRow();
    expect(within(row).getByText(NATIONAL_ID)).toBeInTheDocument();
    expect(within(row).getByText('Blocked')).toBeInTheDocument();
    expect(within(row).getByText('Company')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Unblock' })).toBeInTheDocument();
  });

  it('sends the search and the status filter to the server', async () => {
    const list = vi.spyOn(customersApi, 'list');
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await customerRow();
    expect(list).toHaveBeenLastCalledWith({ status: 'all', page: 1, pageSize: 20 });
    await user.type(screen.getByRole('searchbox', { name: t('customers.search') }), ' ahmed ');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'ahmed',
        status: 'all',
        page: 1,
        pageSize: 20,
      }),
    );
    await user.selectOptions(screen.getByLabelText(t('customers.statusFilter')), 'blocked');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        search: 'ahmed',
        status: 'blocked',
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it.each(['ar', 'en'] as const)(
    'creates a customer in %s: the ID is read while typing and the body is normalised',
    async (lang) => {
      const create = vi.spyOn(customersApi, 'create').mockResolvedValue(customer());
      await renderApp(<CustomersPage />, { lang });
      const user = userEvent.setup();
      await openAdd(user);
      const dialog = await screen.findByRole('dialog');
      await user.type(
        within(dialog).getByLabelText(t('customers.fields.fullName')),
        '  Ahmed   Ali ',
      );
      // Birth date and gender are never typed: there is no field for them, with or without an ID.
      expect(within(dialog).queryByLabelText(t('customers.fields.birthDate'))).toBeNull();
      await user.type(
        within(dialog).getByLabelText(t('customers.fields.nationalId')),
        '2900101-0100015',
      );
      expect(within(dialog).queryByLabelText(t('customers.fields.birthDate'))).toBeNull();
      expect(within(dialog).queryByLabelText(t('customers.fields.gender'))).toBeNull();
      expect(within(dialog).getByText(t('customers.gender.male'))).toBeInTheDocument();
      expect(within(dialog).getByText(t('customers.governorates.01'))).toBeInTheDocument();
      await user.type(
        within(dialog).getByLabelText(t('customers.fields.phoneMain')),
        '+20 100 123 4567',
      );
      await user.click(
        within(dialog).getByRole('button', { name: t('customers.fields.addPhone') }),
      );
      await user.type(
        within(dialog).getByLabelText(t('customers.fields.phoneOther', { n: '2' })),
        '02-2345 6789',
      );
      await user.type(within(dialog).getByLabelText(t('customers.fields.monthlyIncome')), '8500.5');
      await user.click(within(dialog).getByRole('button', { name: t('customers.save') }));

      await waitFor(() => expect(create).toHaveBeenCalled());
      expect(create.mock.calls[0]![0]).toEqual({
        full_name: 'Ahmed Ali',
        phones: ['01001234567', '0223456789'],
        national_id: NATIONAL_ID,
        monthly_income: '8500.50',
        is_business: false,
      });
    },
  );

  it('refuses a bad national ID and a missing phone before calling the server', async () => {
    const create = vi.spyOn(customersApi, 'create');
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await openAdd(user);
    await user.type(screen.getByLabelText(t('customers.fields.fullName')), 'Mona Said');
    await user.type(screen.getByLabelText(t('customers.fields.nationalId')), '29002300100015');
    await user.click(screen.getByRole('button', { name: t('customers.save') }));
    expect(await screen.findByText(t('customers.errors.nationalId'))).toBeInTheDocument();
    expect(screen.getByText(t('customers.errors.phones'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('a company needs a tax number', async () => {
    const create = vi.spyOn(customersApi, 'create');
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await openAdd(user);
    await user.type(screen.getByLabelText(t('customers.fields.fullName')), 'Delta LLC');
    await user.type(screen.getByLabelText(t('customers.fields.phoneMain')), '0235556667');
    await user.click(screen.getByLabelText(t('customers.fields.isBusiness'), { exact: false }));
    await user.click(screen.getByRole('button', { name: t('customers.save') }));
    expect(await screen.findByText(t('customers.errors.taxNo'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('a duplicate national ID shows inline with a link to the customer who has it', async () => {
    const taken = new ApiError(409, 'CUSTOMER_NATIONAL_ID_TAKEN', 'Taken.');
    taken.details = { customer_id: OTHER_ID, full_name: 'Ahmed Ali Hassan' };
    vi.spyOn(customersApi, 'create').mockRejectedValue(taken);
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await openAdd(user);
    await user.type(screen.getByLabelText(t('customers.fields.fullName')), 'Twin');
    await user.type(screen.getByLabelText(t('customers.fields.phoneMain')), '01000000002');
    await user.type(screen.getByLabelText(t('customers.fields.nationalId')), NATIONAL_ID);
    await user.click(screen.getByRole('button', { name: t('customers.save') }));

    expect(await screen.findByText(t('customers.errors.nationalIdTaken'))).toBeInTheDocument();
    expect(screen.getByLabelText(t('customers.fields.nationalId'))).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByText(/Ahmed Ali Hassan/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t('customers.errors.openExisting') })).toHaveAttribute(
      'href',
      `/customers/${OTHER_ID}`,
    );
  });

  it('without customer.view_pii a saved ID is read-only and never sent', async () => {
    const update = vi.spyOn(customersApi, 'update').mockResolvedValue(customer());
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await customerRow()).getByRole('button', { name: t('customers.editAction') }),
    );
    const id = screen.getByLabelText(t('customers.fields.nationalId'));
    expect(id).toHaveValue('**********0015');
    expect(id).toHaveAttribute('readonly');
    expect(screen.getByText(t('customers.fields.nationalIdLocked'))).toBeInTheDocument();
    const city = screen.getByLabelText(t('customers.fields.city'));
    await user.clear(city);
    await user.type(city, 'Giza');
    await user.click(screen.getByRole('button', { name: t('customers.save') }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(CUSTOMER_ID, { city: 'Giza' }));
  });

  it('with customer.view_pii the ID can be replaced; only the changed keys are sent', async () => {
    setPermissions(['customer.create', 'customer.edit', 'customer.view_pii']);
    vi.spyOn(customersApi, 'list').mockResolvedValue(
      page([customer({ national_id: NATIONAL_ID })]),
    );
    const update = vi.spyOn(customersApi, 'update').mockResolvedValue(customer());
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await customerRow()).getByRole('button', { name: t('customers.editAction') }),
    );
    const id = await screen.findByLabelText(t('customers.fields.nationalId'));
    await waitFor(() => expect(id).toHaveValue(NATIONAL_ID));
    expect(screen.getByText(t('customers.fields.nationalIdChangeHint'))).toBeInTheDocument();
    await user.clear(id);
    await user.type(id, '29912318800011');
    await user.click(screen.getByRole('button', { name: t('customers.save') }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(CUSTOMER_ID, { national_id: '29912318800011' }),
    );
  });

  it('blocking asks for a reason and sends it', async () => {
    const setStatus = vi
      .spyOn(customersApi, 'setStatus')
      .mockResolvedValue(customer({ status: 'blocked' }));
    await renderApp(<CustomersPage />, { lang: 'ar' });
    const user = userEvent.setup();
    await user.click(
      within(await customerRow()).getByRole('button', { name: t('customers.block') }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('customers.blockHint'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: t('customers.block') }));
    expect(await within(dialog).findByText(t('customers.errors.reason'))).toBeInTheDocument();
    expect(setStatus).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(t('customers.blockReason')), ' شيكات مرتجعة ');
    await user.click(within(dialog).getByRole('button', { name: t('customers.block') }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(CUSTOMER_ID, {
        status: 'blocked',
        reason: 'شيكات مرتجعة',
      }),
    );
    expect(await screen.findByText(t('customers.blocked'))).toBeInTheDocument();
  });

  it('unblocking only asks to confirm', async () => {
    vi.spyOn(customersApi, 'list').mockResolvedValue(page([customer({ status: 'blocked' })]));
    const setStatus = vi.spyOn(customersApi, 'setStatus').mockResolvedValue(customer());
    await renderApp(<CustomersPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(
      within(await customerRow()).getByRole('button', { name: t('customers.unblock') }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('customers.unblock') }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(CUSTOMER_ID, { status: 'active' }));
  });

  it('hides add, edit and block without the permissions', async () => {
    setPermissions(['collection.create']);
    await renderApp(<CustomersPage />, { lang: 'en' });
    const row = await customerRow();
    expect(screen.queryByRole('button', { name: t('customers.add') })).toBeNull();
    expect(within(row).queryByRole('button', { name: t('customers.editAction') })).toBeNull();
    expect(within(row).queryByRole('button', { name: t('customers.block') })).toBeNull();
  });
});
