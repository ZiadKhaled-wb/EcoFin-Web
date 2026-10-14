import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type {
  Customer,
  CustomerGuarantor,
  Guarantor,
  GuarantorList,
  PermissionKey,
} from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { customersApi } from '@/services/customersApi';
import { guarantorsApi } from '@/services/guarantorsApi';
import { t } from '@/i18n';
import CustomerPage from './CustomerPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0710000-0000-4000-8000-0000000000c1';
const G1 = 'a0710000-0000-4000-8000-0000000000a1';
const G2 = 'a0710000-0000-4000-8000-0000000000a2';
const G3 = 'a0710000-0000-4000-8000-0000000000a3';
const timestamp = '2026-10-15T09:00:00.000Z';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: CUSTOMER_ID,
  full_name: 'Ahmed Ali Hassan',
  phones: ['01001234567'],
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: '1990-01-01',
  gender: 'male',
  governorate_code: '01',
  address: null,
  city: null,
  job: null,
  employer: null,
  monthly_income: null,
  is_business: false,
  tax_registration_no: null,
  status: 'active',
  notes: null,
  id_photos_count: 0,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});

const guarantor = (id: string, name: string, over: Partial<CustomerGuarantor> = {}) =>
  ({
    id,
    full_name: name,
    phone: '01009990001',
    national_id: null,
    national_id_masked: '**********0023',
    birth_date: null,
    gender: null,
    address: null,
    job: null,
    monthly_income: null,
    also_customer: null,
    archived_at: null,
    id_photos_count: 1,
    created_at: timestamp,
    updated_at: timestamp,
    relation: 'father',
    linked_at: timestamp,
    on_active_contract: false,
    ...over,
  }) satisfies CustomerGuarantor;

const created = (): Guarantor => {
  const base: Partial<CustomerGuarantor> = guarantor(G3, 'New One');
  delete base.relation;
  delete base.linked_at;
  delete base.on_active_contract;
  return base as Guarantor;
};

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderPage = (lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/:id" element={<CustomerPage />} />
    </Routes>,
    { lang, route: `/customers/${CUSTOMER_ID}` },
  );
const section = () =>
  screen.findByRole('heading', { level: 2, name: t('guarantors.section.title') });

describe('R04 customer guarantors card', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['guarantor.manage', 'customer.create']);
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([
      guarantor(G1, 'Mahmoud Hassan', { also_customer: { id: G2, full_name: 'Mahmoud Hassan' } }),
      guarantor(G2, 'Mona Said', { relation: 'colleague', on_active_contract: true }),
    ]);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the guarantors with their relation, masked ID, badges and a link to each', async () => {
    await renderPage();
    await section();
    const table = await screen.findByRole('table', { name: t('guarantors.section.title') });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    const first = within(rows[1]!);
    expect(first.getByRole('link', { name: 'Mahmoud Hassan' })).toHaveAttribute(
      'href',
      `/customers/guarantors/${G1}`,
    );
    expect(first.getByText(t('guarantors.relation.father'))).toBeInTheDocument();
    expect(first.getByText('**********0023')).toHaveAttribute('dir', 'ltr');
    expect(
      first.getByRole('link', {
        name: t('guarantors.section.openCustomer', { name: 'Mahmoud Hassan' }),
      }),
    ).toBeInTheDocument();
    const second = within(rows[2]!);
    expect(second.getByText(t('guarantors.relation.colleague'))).toBeInTheDocument();
    expect(second.getByText(t('guarantors.section.onContract'))).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d{14}/);
  });

  it('shows the same section in Arabic with Arabic relation names', async () => {
    await renderPage('ar');
    expect(await screen.findByRole('heading', { level: 2, name: 'الضامنون' })).toBeInTheDocument();
    expect(await screen.findByText('الأب')).toBeInTheDocument();
    expect(screen.getByText('زميل عمل')).toBeInTheDocument();
  });

  it('a cashier (customer.create) can add but cannot change a relation or unlink', async () => {
    setPermissions(['customer.create']);
    await renderPage();
    await screen.findByRole('table', { name: t('guarantors.section.title') });
    expect(screen.getByRole('button', { name: t('guarantors.section.add') })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: t('guarantors.section.changeRelation') }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: t('guarantors.section.unlink') })).toBeNull();
    expect(
      screen.queryByRole('columnheader', { name: t('guarantors.columns.actions') }),
    ).toBeNull();
  });

  it('without either key there is no add button and the list still reads', async () => {
    setPermissions(['sale.create']);
    await renderPage();
    await screen.findByRole('table', { name: t('guarantors.section.title') });
    expect(screen.queryByRole('button', { name: t('guarantors.section.add') })).toBeNull();
  });

  it('shows the full ID to a user with customer.view_pii', async () => {
    setPermissions(['customer.view_pii']);
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([
      guarantor(G1, 'Mahmoud Hassan', { national_id: '29001010100015' }),
    ]);
    vi.spyOn(guarantorsApi, 'photos').mockResolvedValue([]);
    vi.spyOn(customersApi, 'photos').mockResolvedValue([]);
    await renderPage();
    expect(await screen.findByText('29001010100015')).toHaveAttribute('dir', 'ltr');
  });

  it('at five guarantors Add is disabled with a hint', async () => {
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue(
      ['a', 'b', 'c', 'd', 'e'].map((x, i) =>
        guarantor(`a0710000-0000-4000-8000-0000000000b${i}`, `Guarantor ${x}`),
      ),
    );
    await renderPage();
    await screen.findByRole('table', { name: t('guarantors.section.title') });
    expect(screen.getByRole('button', { name: t('guarantors.section.add') })).toBeDisabled();
    expect(screen.getByText(t('guarantors.section.limit', { count: '5' }))).toBeInTheDocument();
  });

  it('a blocked customer has no add button, only a note', async () => {
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer({ status: 'blocked' }));
    await renderPage();
    await screen.findByRole('table', { name: t('guarantors.section.title') });
    expect(screen.queryByRole('button', { name: t('guarantors.section.add') })).toBeNull();
    expect(screen.getByText(t('guarantors.section.blockedHint'))).toBeInTheDocument();
  });

  it('an empty list says so', async () => {
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([]);
    await renderPage();
    expect(await screen.findByText(t('guarantors.section.empty'))).toBeInTheDocument();
  });

  it('creating a new guarantor sends one request with the link and a clean body', async () => {
    const create = vi.spyOn(guarantorsApi, 'create').mockResolvedValue(created());
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.section.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.fullName'))),
      '  New   One ',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.phone'))),
      '+20 100 123 4567',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.nationalId'))),
      '2900101-0100015',
    );
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.relation'))),
      'brother',
    );
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.add.save') }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith({
      full_name: 'New One',
      phone: '01001234567',
      national_id: '29001010100015',
      link: { customer_id: CUSTOMER_ID, relation: 'brother' },
    });
    expect(await screen.findByText(t('guarantors.add.added'))).toBeInTheDocument();
  });

  it('refuses a missing relation or a bad ID without calling the API', async () => {
    const create = vi.spyOn(guarantorsApi, 'create');
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.section.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.fullName'))),
      'New One',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.phone'))),
      '01001234567',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.nationalId'))),
      '12345',
    );
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.add.save') }));
    expect(await within(dialog).findByText(t('guarantors.errors.nationalId'))).toBeInTheDocument();
    expect(within(dialog).getByText(t('guarantors.errors.relation'))).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('a national ID another guarantor has offers to link that guarantor instead', async () => {
    vi.spyOn(guarantorsApi, 'create').mockRejectedValue(
      Object.assign(new ApiError(409, 'GUARANTOR_NATIONAL_ID_TAKEN', 'Taken.'), {
        details: { guarantor_id: G3, full_name: 'Already There' },
      }),
    );
    vi.spyOn(guarantorsApi, 'list').mockResolvedValue({
      items: [{ ...created(), id: G3, full_name: 'Already There' }],
      total: 1,
      page: 1,
      pageSize: 10,
    } satisfies GuarantorList);
    const link = vi
      .spyOn(guarantorsApi, 'link')
      .mockResolvedValue([guarantor(G3, 'Already There')]);
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.section.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.fullName'))),
      'Already There',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.phone'))),
      '01001234567',
    );
    await user.type(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.nationalId'))),
      '29001010100015',
    );
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.relation'))),
      'friend',
    );
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.add.save') }));
    expect(
      await within(dialog).findByText(t('guarantors.add.takenTitle', { name: 'Already There' })),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.add.takenAction') }));
    // The existing tab opens with that guarantor already picked.
    expect(
      await within(dialog).findByText(t('guarantors.add.picked', { name: 'Already There' })),
    ).toBeInTheDocument();
    await user.selectOptions(
      within(dialog).getByLabelText(new RegExp(t('guarantors.fields.relation'))),
      'friend',
    );
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.add.link') }));
    await waitFor(() =>
      expect(link).toHaveBeenCalledWith(CUSTOMER_ID, { guarantor_id: G3, relation: 'friend' }),
    );
  });

  it('the existing tab searches the shop and does not offer the ones already linked', async () => {
    const list = vi.spyOn(guarantorsApi, 'list').mockResolvedValue({
      items: [
        { ...created(), id: G1, full_name: 'Mahmoud Hassan' },
        { ...created(), id: G3, full_name: 'Free One' },
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    });
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.section.add') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('tab', { name: t('guarantors.add.existing') }));
    expect(await within(dialog).findByRole('button', { name: /Mahmoud Hassan/ })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: /Free One/ })).toBeEnabled();
    await user.type(within(dialog).getByRole('searchbox'), 'free');
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(expect.objectContaining({ search: 'free' })),
    );
  });

  it('changes a relation', async () => {
    const setRelation = vi
      .spyOn(guarantorsApi, 'setRelation')
      .mockResolvedValue([guarantor(G1, 'Mahmoud Hassan', { relation: 'friend' })]);
    await renderPage();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', {
      name: t('guarantors.section.changeRelation'),
    });
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(
      within(dialog).getByLabelText(t('guarantors.fields.relation')),
      'friend',
    );
    await user.click(
      within(dialog).getByRole('button', { name: t('guarantors.relationDialog.save') }),
    );
    await waitFor(() =>
      expect(setRelation).toHaveBeenCalledWith(CUSTOMER_ID, G1, { relation: 'friend' }),
    );
  });

  it('unlinks after a confirmation', async () => {
    const unlink = vi.spyOn(guarantorsApi, 'unlink').mockResolvedValue([]);
    await renderPage();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: t('guarantors.section.unlink') });
    await user.click(buttons[0]!);
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(unlink).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole('button', { name: t('guarantors.unlinkDialog.confirm') }),
    );
    await waitFor(() => expect(unlink).toHaveBeenCalledWith(CUSTOMER_ID, G1));
    expect(await screen.findByText(t('guarantors.unlinkDialog.done'))).toBeInTheDocument();
  });

  it('a guarantor on an active contract can not be unlinked: the refusal is translated', async () => {
    vi.spyOn(guarantorsApi, 'unlink').mockRejectedValue(
      new ApiError(409, 'GUARANTOR_ON_ACTIVE_CONTRACT', 'On a contract.'),
    );
    await renderPage();
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: t('guarantors.section.unlink') });
    await user.click(buttons[1]!);
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await user.click(
      within(dialog).getByRole('button', { name: t('guarantors.unlinkDialog.confirm') }),
    );
    expect(
      await screen.findByText(t('guarantors.errors.GUARANTOR_ON_ACTIVE_CONTRACT')),
    ).toBeInTheDocument();
  });
});
