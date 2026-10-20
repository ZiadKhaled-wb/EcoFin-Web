import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey, ShopSettings } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { settingsApi } from '@/services/settingsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ContractTermsSettings from './ContractTermsSettings';
import PrintDocumentButtons from './PrintDocumentButtons';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.setConfig({ testTimeout: 30_000 });

const saved = (over: Partial<ShopSettings> = {}) =>
  ({ contract_terms: null, promissory_notes_mode: 'per_installment', ...over }) as ShopSettings;

describe('N07 contract and promissory notes settings', () => {
  beforeEach(() => signIn());
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('saves the notes mode', async () => {
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue(saved());
    await renderApp(<ContractTermsSettings saved={saved()} />, { lang: 'en' });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(
      screen.getByRole('radio', { name: 'One note for everything that is left' }),
    );
    expect(
      screen.getByText("A single note is due on the last installment's date."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        promissory_notes_mode: 'single',
        contract_terms: null,
      }),
    );
  });

  it('inserts a placeholder, shows it rendered with sample values, and saves the text', async () => {
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue(saved());
    await renderApp(<ContractTermsSettings saved={saved()} />, { lang: 'en' });
    expect(screen.getByText('The default text is used.')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('insert-customer_name'));
    expect(screen.getByLabelText('Terms printed on the contract')).toHaveValue('{{customer_name}}');
    expect(screen.getByTestId('terms-preview')).toHaveTextContent('أحمد محمد');
    expect(screen.getByText('Your own text is used.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        promissory_notes_mode: 'per_installment',
        contract_terms: '{{customer_name}}',
      }),
    );
  });

  it('warns while typing about forbidden wording and unknown details, and will not save them', async () => {
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue(saved());
    await renderApp(<ContractTermsSettings saved={saved()} />, { lang: 'en' });
    await userEvent.click(screen.getByLabelText('Terms printed on the contract'));
    await userEvent.paste('فائدة {{oops}}');
    expect(
      screen.getByText(/This wording is not allowed on the contract: فائدة/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Unknown details: oops/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it('restores the default text', async () => {
    const update = vi.spyOn(settingsApi, 'update').mockResolvedValue(saved());
    await renderApp(<ContractTermsSettings saved={saved({ contract_terms: 'نص خاص' })} />, {
      lang: 'en',
    });
    expect(screen.getByLabelText('Terms printed on the contract')).toHaveValue('نص خاص');
    await userEvent.click(screen.getByRole('button', { name: 'Restore the default text' }));
    expect(screen.getByText('The default text is used.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        promissory_notes_mode: 'per_installment',
        contract_terms: null,
      }),
    );
  });

  it("shows the server's refusal", async () => {
    vi.spyOn(settingsApi, 'update').mockRejectedValue(
      new ApiError(422, 'TEMPLATE_NOT_ALLOWED', 'x'),
    );
    await renderApp(<ContractTermsSettings saved={saved()} />, { lang: 'en' });
    await userEvent.click(
      screen.getByRole('radio', { name: 'One note for everything that is left' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/use wording that is not allowed/)).toBeInTheDocument();
  });

  it('is written in Arabic when the screen is Arabic', async () => {
    await renderApp(<ContractTermsSettings saved={saved()} />, { lang: 'ar' });
    expect(screen.getByText('العقد والكمبيالات')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'كمبيالة لكل قسط' })).toBeChecked();
  });
});

describe('N07 print buttons', () => {
  beforeEach(() => signIn());
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });
  const show = async (keys: PermissionKey[], notes = true) => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
    await renderApp(<PrintDocumentButtons contractId="abc" notes={notes} />, { lang: 'en' });
  };

  it('link to the print view for the contract and for the notes', async () => {
    await show(['installment.create']);
    expect(await screen.findByRole('link', { name: 'Print contract' })).toHaveAttribute(
      'href',
      '/contracts/abc/print?doc=contract',
    );
    expect(screen.getByRole('link', { name: 'Print promissory notes' })).toHaveAttribute(
      'href',
      '/contracts/abc/print?doc=notes',
    );
  });

  it('hide the notes of a closed contract, and everything without a print key', async () => {
    await show(['customer.view_pii'], false);
    expect(await screen.findByRole('link', { name: 'Print contract' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Print promissory notes' })).toBeNull();
  });

  it('show nothing to a role without installment.create or customer.view_pii', async () => {
    await show(['collection.create']);
    await waitFor(() => expect(meApi.permissions).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Print contract' })).toBeNull();
  });
});
