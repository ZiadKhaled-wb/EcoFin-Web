import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { FileResponse, GuarantorDetails, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { guarantorsApi } from '@/services/guarantorsApi';
import { t } from '@/i18n';
import GuarantorPage from './GuarantorPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a0710000-0000-4000-8000-0000000000a1';
const CUSTOMER_ID = 'a0710000-0000-4000-8000-0000000000c1';
const NATIONAL_ID = '29001010100015';
const timestamp = '2026-10-15T09:00:00.000Z';

const details = (over: Partial<GuarantorDetails> = {}): GuarantorDetails => ({
  id: ID,
  full_name: 'Mahmoud Hassan',
  phone: '01001234567',
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: null,
  gender: null,
  address: '5 Nile St',
  job: 'Teacher',
  monthly_income: '6000.00',
  also_customer: null,
  archived_at: null,
  id_photos_count: 2,
  created_at: timestamp,
  updated_at: timestamp,
  customers: [
    { customer_id: CUSTOMER_ID, full_name: 'Ahmed Ali', relation: 'friend', linked_at: timestamp },
  ],
  contracts: [],
  ...over,
});

const photo = (n: number): FileResponse => ({
  id: `a0710000-0000-4000-8000-0000000000f${n}`,
  purpose: 'customer_id',
  originalName: `id-${n}.jpg`,
  mime: 'image/jpeg',
  sizeBytes: 1000,
  entityType: 'guarantor',
  entityId: ID,
  createdAt: timestamp,
});

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderAt = (id: string, lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/guarantors/:id" element={<GuarantorPage />} />
    </Routes>,
    { lang, route: `/customers/guarantors/${id}` },
  );

describe('R04 guarantor page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['customer.create']);
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(details());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('without customer.view_pii: the masked ID with its note, no photo list, no birth date', async () => {
    const photos = vi.spyOn(guarantorsApi, 'photos');
    await renderAt(ID);
    expect(await screen.findByRole('heading', { name: 'Mahmoud Hassan' })).toBeInTheDocument();
    expect(screen.getByText('**********0015')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText(t('guarantors.page.idHidden'))).toBeInTheDocument();
    expect(screen.queryByText(t('guarantors.fields.birthDate'))).toBeNull();
    expect(screen.getByText(t('guarantors.page.photosCount', { count: '2' }))).toBeInTheDocument();
    expect(screen.getByText(t('guarantors.page.photosHidden'))).toBeInTheDocument();
    expect(photos).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/\d{14}/);
    // customer.create adds ID photos but neither edits nor archives.
    expect(
      screen.getByRole('button', { name: t('guarantors.page.uploadPhoto') }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('guarantors.page.edit') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('guarantors.page.archive') })).toBeNull();
  });

  it('with customer.view_pii in Arabic: the full ID, birth date, gender and the photos to open', async () => {
    setPermissions(['guarantor.manage', 'customer.view_pii']);
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(
      details({ national_id: NATIONAL_ID, birth_date: '1990-01-01', gender: 'male' }),
    );
    vi.spyOn(guarantorsApi, 'photos').mockResolvedValue([photo(1), photo(2)]);
    const url = vi
      .spyOn(guarantorsApi, 'photoUrl')
      .mockResolvedValue({ url: 'https://files.example/signed', expiresAt: timestamp });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderAt(ID, 'ar');
    expect(await screen.findByText(NATIONAL_ID)).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('ذكر')).toBeInTheDocument();
    const views = await screen.findAllByRole('button', { name: t('guarantors.page.viewPhoto') });
    expect(views).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(views[0]!);
    await waitFor(() => expect(url).toHaveBeenCalledWith(photo(1).id));
    expect(open).toHaveBeenCalledWith(
      'https://files.example/signed',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('shows the customers they back with the relation, and "also a customer"', async () => {
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(
      details({ also_customer: { id: CUSTOMER_ID, full_name: 'Mahmoud Hassan' } }),
    );
    await renderAt(ID);
    const link = await screen.findByRole('link', { name: 'Ahmed Ali' });
    expect(link).toHaveAttribute('href', `/customers/${CUSTOMER_ID}`);
    expect(screen.getByText(t('guarantors.relation.friend'))).toBeInTheDocument();
    expect(
      screen.getByText(t('guarantors.page.alsoCustomerNote', { name: 'Mahmoud Hassan' })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('guarantors.page.contractsEmpty'))).toBeInTheDocument();
  });

  it('lists the contracts once there are some', async () => {
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(
      details({
        contracts: [
          {
            contract_id: 'a0710000-0000-4000-8000-0000000000d1',
            number: 'BR1-IN-26-000001',
            customer_id: CUSTOMER_ID,
            customer_name: 'Ahmed Ali',
            status: 'active',
            total_payable: '15000.00',
          },
        ],
      }),
    );
    await renderAt(ID);
    expect(await screen.findByText('BR1-IN-26-000001')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText(t('guarantors.page.contractStatus.active'))).toBeInTheDocument();
  });

  it('uploads an ID photo for the guarantor and refreshes', async () => {
    setPermissions(['customer.create', 'customer.view_pii']);
    vi.spyOn(guarantorsApi, 'photos').mockResolvedValue([]);
    const upload = vi.spyOn(guarantorsApi, 'uploadPhoto').mockResolvedValue(photo(1));
    await renderAt(ID);
    expect(await screen.findByText(t('guarantors.page.photosEmpty'))).toBeInTheDocument();
    const user = userEvent.setup();
    const file = new File(['x'], 'front.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(t('guarantors.page.uploadPhoto')), file);
    await waitFor(() => expect(upload).toHaveBeenCalledWith(ID, file));
    expect(await screen.findByText(t('guarantors.page.photoUploaded'))).toBeInTheDocument();
  });

  it('a refused photo type shows its message', async () => {
    setPermissions(['customer.create', 'customer.view_pii']);
    vi.spyOn(guarantorsApi, 'photos').mockResolvedValue([]);
    vi.spyOn(guarantorsApi, 'uploadPhoto').mockRejectedValue(
      new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', 'Type.'),
    );
    await renderAt(ID);
    await screen.findByText(t('guarantors.page.photosEmpty'));
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      screen.getByLabelText(t('guarantors.page.uploadPhoto')),
      new File(['x'], 'id.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText(t('guarantors.page.photoType'))).toBeInTheDocument();
  });

  it('edits with guarantor.manage and sends only what changed; the ID stays locked without view_pii', async () => {
    setPermissions(['guarantor.manage']);
    const update = vi
      .spyOn(guarantorsApi, 'update')
      .mockResolvedValue({ ...details(), job: 'Headmaster' });
    await renderAt(ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.edit') }));
    const dialog = await screen.findByRole('dialog');
    const id = within(dialog).getByLabelText(new RegExp(t('guarantors.fields.nationalId')));
    expect(id).toHaveAttribute('readonly');
    expect(id).toHaveValue('**********0015');
    const job = within(dialog).getByLabelText(t('guarantors.fields.job'));
    await user.clear(job);
    await user.type(job, 'Headmaster');
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.form.save') }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(ID, { job: 'Headmaster' }));
  });

  it('with customer.view_pii the ID can be changed; a duplicate points at the other guarantor', async () => {
    setPermissions(['guarantor.manage', 'customer.view_pii']);
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(details({ national_id: NATIONAL_ID }));
    vi.spyOn(guarantorsApi, 'photos').mockResolvedValue([]);
    const other = 'a0710000-0000-4000-8000-0000000000a9';
    const update = vi.spyOn(guarantorsApi, 'update').mockRejectedValue(
      Object.assign(new ApiError(409, 'GUARANTOR_NATIONAL_ID_TAKEN', 'Taken.'), {
        details: { guarantor_id: other, full_name: 'Someone Else' },
      }),
    );
    await renderAt(ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.edit') }));
    const dialog = await screen.findByRole('dialog');
    const id = within(dialog).getByLabelText(new RegExp(t('guarantors.fields.nationalId')));
    expect(id).toHaveValue(NATIONAL_ID);
    await user.clear(id);
    await user.type(id, '28506152100023');
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.form.save') }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(ID, { national_id: '28506152100023' }));
    expect(
      await within(dialog).findByText(t('guarantors.errors.GUARANTOR_NATIONAL_ID_TAKEN')),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: t('guarantors.section.open') }),
    ).toHaveAttribute('href', `/customers/guarantors/${other}`);
  });

  it('refuses a bad phone in the edit form without calling the API', async () => {
    setPermissions(['guarantor.manage']);
    const update = vi.spyOn(guarantorsApi, 'update');
    await renderAt(ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.edit') }));
    const dialog = await screen.findByRole('dialog');
    const phone = within(dialog).getByLabelText(new RegExp(t('guarantors.fields.phone')));
    await user.clear(phone);
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.form.save') }));
    expect(await within(dialog).findByText(t('guarantors.errors.phone'))).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('archives after a confirmation and restores an archived guarantor', async () => {
    setPermissions(['guarantor.manage']);
    const archive = vi
      .spyOn(guarantorsApi, 'archive')
      .mockResolvedValue(details({ archived_at: timestamp }));
    await renderAt(ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.archive') }));
    const dialog = await screen.findByRole('dialog');
    expect(archive).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.page.archive') }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith(ID));
    expect(await screen.findByText(t('guarantors.page.archived'))).toBeInTheDocument();
  });

  it('restores an archived guarantor', async () => {
    setPermissions(['guarantor.manage']);
    vi.spyOn(guarantorsApi, 'get').mockResolvedValue(details({ archived_at: timestamp }));
    const restore = vi.spyOn(guarantorsApi, 'restore').mockResolvedValue(details());
    await renderAt(ID);
    expect(await screen.findByText(t('guarantors.page.archivedBadge'))).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.restore') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.page.restore') }));
    await waitFor(() => expect(restore).toHaveBeenCalledWith(ID));
  });

  it('an archive that the server refuses (active contract) is translated', async () => {
    setPermissions(['guarantor.manage']);
    vi.spyOn(guarantorsApi, 'archive').mockRejectedValue(
      new ApiError(409, 'GUARANTOR_ON_ACTIVE_CONTRACT', 'On a contract.'),
    );
    await renderAt(ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('guarantors.page.archive') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('guarantors.page.archive') }));
    expect(
      await screen.findByText(t('guarantors.errors.GUARANTOR_ON_ACTIVE_CONTRACT')),
    ).toBeInTheDocument();
  });

  it('an id that is not a UUID never reaches the API', async () => {
    const get = vi.spyOn(guarantorsApi, 'get');
    await renderAt('not-a-uuid');
    expect(await screen.findByText(t('guarantors.page.notFound'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("another shop's guarantor reads as not found", async () => {
    vi.spyOn(guarantorsApi, 'get').mockRejectedValue(
      new ApiError(404, 'GUARANTOR_NOT_FOUND', 'Not found.'),
    );
    await renderAt(ID);
    expect(await screen.findByText(t('guarantors.page.notFound'))).toBeInTheDocument();
  });
});
