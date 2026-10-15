import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { Customer, FileResponse, PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { meFixture, permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { customersApi } from '@/services/customersApi';
import { creditApi } from '@/services/creditApi';
import { guarantorsApi } from '@/services/guarantorsApi';
import { surveysApi } from '@/services/surveysApi';
import { t } from '@/i18n';
import CustomerPage from './CustomerPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const CUSTOMER_ID = 'a0630000-0000-4000-8000-000000000001';
const NATIONAL_ID = '29001010100015';
const timestamp = '2026-10-12T09:00:00.000Z';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: CUSTOMER_ID,
  full_name: 'Ahmed Ali Hassan',
  phones: ['01001234567'],
  national_id: null,
  national_id_masked: '**********0015',
  birth_date: '1990-01-01',
  gender: 'male',
  governorate_code: '01',
  address: '12 Tahrir St',
  city: 'Nasr City',
  job: 'Engineer',
  employer: null,
  monthly_income: '8500.50',
  is_business: false,
  tax_registration_no: null,
  status: 'active',
  notes: null,
  id_photos_count: 2,
  created_at: timestamp,
  updated_at: timestamp,
  ...over,
});

const photo = (n: number): FileResponse => ({
  id: `a0630000-0000-4000-8000-0000000000f${n}`,
  purpose: 'customer_id',
  originalName: `id-${n}.jpg`,
  mime: 'image/jpeg',
  sizeBytes: 1000,
  entityType: 'customer',
  entityId: CUSTOMER_ID,
  createdAt: timestamp,
});

function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const renderAt = (id: string, lang: 'ar' | 'en' = 'en') =>
  renderApp(
    <Routes>
      <Route path="/customers/:id" element={<CustomerPage />} />
    </Routes>,
    { lang, route: `/customers/${id}` },
  );

describe('R01 customer profile', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['customer.create']);
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer());
    vi.spyOn(creditApi, 'profile').mockResolvedValue({
      customer_id: CUSTOMER_ID,
      status: 'active',
      credit_limit: '0.00',
      suggested_limit: null,
      exposure: '0.00',
      available: '0.00',
      over_limit_by: '0.00',
      score: 0,
      min_score: 50,
      components: [
        { key: 'guarantors', weight: 40, value: 0, points: 0 },
        { key: 'income', weight: 30, value: 0, points: 0 },
        { key: 'residence', weight: 20, value: 0, points: 0 },
        { key: 'identity', weight: 10, value: 0, points: 0 },
      ],
      behaviour: {
        due_lines: 0,
        on_time_pct: null,
        max_days_late: null,
        current_overdue_amount: '0.00',
        overdue_lines: 0,
        open_contracts: 0,
        completed_contracts: 0,
      },
      store_credit: '0.00',
      limit_history: [],
      latest_survey: null,
    });
    vi.spyOn(guarantorsApi, 'ofCustomer').mockResolvedValue([]);
    vi.spyOn(surveysApi, 'ofCustomer').mockResolvedValue([]);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('without customer.view_pii: the masked ID with its note and the governorate, no photo list', async () => {
    const photos = vi.spyOn(customersApi, 'photos');
    await renderAt(CUSTOMER_ID);
    expect(await screen.findByRole('heading', { name: 'Ahmed Ali Hassan' })).toBeInTheDocument();
    expect(screen.getByText('**********0015')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText(t('customers.profile.idHidden'))).toBeInTheDocument();
    // The governorate is read from the ID by the server and shown to everyone; the number stays masked.
    expect(screen.getByText(t('customers.fields.governorate'))).toBeInTheDocument();
    expect(screen.getByText(t('customers.governorates.01'))).toBeInTheDocument();
    expect(
      screen.getByText(t('customers.profile.photosCount', { count: '2' })),
    ).toBeInTheDocument();
    expect(screen.getByText(t('customers.profile.photosHidden'))).toBeInTheDocument();
    expect(photos).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/\d{14}/);
    // customer.create alone neither edits nor blocks, but it adds ID photos (a cashier at the counter).
    expect(screen.queryByRole('button', { name: t('customers.editAction') })).toBeNull();
    expect(screen.queryByRole('button', { name: t('customers.block') })).toBeNull();
    expect(
      screen.getByRole('button', { name: t('customers.profile.uploadPhoto') }),
    ).toBeInTheDocument();
  });

  it('with customer.view_pii in Arabic: the full ID, its governorate and the photos to open', async () => {
    setPermissions(['customer.edit', 'customer.view_pii']);
    vi.spyOn(customersApi, 'get').mockResolvedValue(customer({ national_id: NATIONAL_ID }));
    vi.spyOn(customersApi, 'photos').mockResolvedValue([photo(1), photo(2)]);
    const url = vi
      .spyOn(customersApi, 'photoUrl')
      .mockResolvedValue({ url: 'https://files.example/signed', expiresAt: timestamp });
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await renderAt(CUSTOMER_ID, 'ar');
    expect(await screen.findByText(NATIONAL_ID)).toHaveAttribute('dir', 'ltr');
    expect(screen.queryByText(t('customers.profile.idHidden'))).toBeNull();
    expect(screen.getByText('القاهرة')).toBeInTheDocument();
    expect(screen.getByText('ذكر')).toBeInTheDocument();
    const views = await screen.findAllByRole('button', { name: t('customers.profile.viewPhoto') });
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

  it('uploads an ID photo for the customer and refreshes', async () => {
    setPermissions(['customer.create', 'customer.view_pii']);
    vi.spyOn(customersApi, 'photos').mockResolvedValue([]);
    const upload = vi.spyOn(customersApi, 'uploadPhoto').mockResolvedValue(photo(1));
    await renderAt(CUSTOMER_ID);
    expect(await screen.findByText(t('customers.profile.photosEmpty'))).toBeInTheDocument();
    const user = userEvent.setup();
    const file = new File(['x'], 'front.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(t('customers.profile.uploadPhoto')), file);
    await waitFor(() => expect(upload).toHaveBeenCalledWith(CUSTOMER_ID, file));
    expect(await screen.findByText(t('customers.profile.photoUploaded'))).toBeInTheDocument();
  });

  it('a refused photo type shows its message', async () => {
    setPermissions(['customer.create', 'customer.view_pii']);
    vi.spyOn(customersApi, 'photos').mockResolvedValue([]);
    vi.spyOn(customersApi, 'uploadPhoto').mockRejectedValue(
      new ApiError(415, 'FILE_TYPE_NOT_ALLOWED', 'Type.'),
    );
    await renderAt(CUSTOMER_ID);
    await screen.findByText(t('customers.profile.photosEmpty'));
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(
      screen.getByLabelText(t('customers.profile.uploadPhoto')),
      new File(['x'], 'id.pdf', { type: 'application/pdf' }),
    );
    expect(await screen.findByText(t('customers.profile.photoType'))).toBeInTheDocument();
  });

  it('blocks from the profile with a reason', async () => {
    setPermissions(['customer.edit']);
    const setStatus = vi
      .spyOn(customersApi, 'setStatus')
      .mockResolvedValue(customer({ status: 'blocked' }));
    await renderAt(CUSTOMER_ID);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('customers.block') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('customers.blockReason')), 'bounced cheques');
    await user.click(within(dialog).getByRole('button', { name: t('customers.block') }));
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(CUSTOMER_ID, {
        status: 'blocked',
        reason: 'bounced cheques',
      }),
    );
  });

  it('an id that is not a UUID never reaches the API', async () => {
    const get = vi.spyOn(customersApi, 'get');
    await renderAt('not-a-uuid');
    expect(await screen.findByText(t('customers.profile.notFound'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("another shop's customer reads as not found", async () => {
    vi.spyOn(customersApi, 'get').mockRejectedValue(
      new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Not found.'),
    );
    await renderAt(CUSTOMER_ID);
    expect(await screen.findByText(t('customers.profile.notFound'))).toBeInTheDocument();
  });

  it('R05: the surveys card offers Assign only with survey.assign', async () => {
    await renderAt(CUSTOMER_ID);
    expect(
      await screen.findByRole('heading', { level: 2, name: t('surveys.card.title') }),
    ).toBeInTheDocument();
    expect(await screen.findByText(t('surveys.card.empty'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('surveys.card.assign') })).toBeNull();
  });

  it('R05: a manager assigns a survey from the customer page', async () => {
    setPermissions(['survey.assign', 'survey.submit']);
    vi.spyOn(meApi, 'me').mockResolvedValue(meFixture());
    await renderAt(CUSTOMER_ID);
    expect(
      await screen.findByRole('button', { name: t('surveys.card.assign') }),
    ).toBeInTheDocument();
  });

  it('R05: no Assign for a blocked customer', async () => {
    setPermissions(['survey.assign']);
    vi.mocked(customersApi.get).mockResolvedValue(customer({ status: 'blocked' }));
    await renderAt(CUSTOMER_ID);
    expect(await screen.findByText(t('surveys.card.blockedHint'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('surveys.card.assign') })).toBeNull();
  });
});
