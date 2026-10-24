import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Contract } from '@ziadkhaled-wb/contracts';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { installmentsApi } from '@/services/installmentsApi';
import { legalApi } from '@/services/legalApi';
import { subscriptionApi } from '@/services/subscriptionApi';
import { renderApp, signIn, signOut } from '@/test/renderApp';
import { CASE_ID, CONTRACT_ID, LAWYER_ID, legalDetail } from '@/test/legalFixtures';
import { OpenLegalCaseButton } from './OpenLegalCaseDialog';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const contract = (remaining = '10500.00') =>
  ({
    id: CONTRACT_ID,
    number: 'MAIN-CT-26-000001',
    balance: { paid: '1500.00', remaining, overdue: '1000.00' },
  }) as Contract;

const renderButton = () =>
  renderApp(
    <Routes>
      <Route
        path="/"
        element={
          <OpenLegalCaseButton contractId={CONTRACT_ID} contractNumber="MAIN-CT-26-000001" />
        }
      />
      <Route path="/legal/cases/:id" element={<p>The case page</p>} />
    </Routes>,
    { lang: 'en' },
  );

describe('L01 open a legal case (owner)', () => {
  beforeEach(() => {
    signIn('OWNER');
    vi.spyOn(installmentsApi, 'contract').mockResolvedValue(contract());
    vi.spyOn(legalApi, 'lawyers').mockResolvedValue({
      items: [{ id: LAWYER_ID, full_name: 'Lawyer One', phone: null, open_cases: 0 }],
    });
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('prefills the claim with what the contract still owes and refuses a higher one', async () => {
    await renderButton();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open legal case' }));
    const dialog = await screen.findByRole('dialog');
    const claim = await within(dialog).findByLabelText('Claim');
    await waitFor(() => expect(claim).toHaveValue('10500.00'));
    const confirm = within(dialog).getByRole('button', { name: 'Open the case' });
    expect(confirm).toBeEnabled();
    await user.clear(claim);
    await user.type(claim, '10500.01');
    expect(
      await within(dialog).findByText(/can't be more than what the contract still owes/),
    ).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    await user.clear(claim);
    await user.type(claim, '0');
    expect(await within(dialog).findByText('The claim must be above 0.')).toBeInTheDocument();
    expect(confirm).toBeDisabled();
    expect(dialog).not.toHaveTextContent(/fee|interest/i);
  }, 20_000);

  it('opens the case with the details and goes to it; court costs are not a field', async () => {
    const open = vi.spyOn(legalApi, 'open').mockResolvedValue(legalDetail());
    await renderButton();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open legal case' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Claim')).toHaveValue('10500.00'));
    await user.selectOptions(within(dialog).getByLabelText('Lawyer'), LAWYER_ID);
    await user.type(within(dialog).getByLabelText('Court'), 'Cairo Court');
    await user.type(within(dialog).getByLabelText('First note (optional)'), 'Start');
    await user.click(within(dialog).getByRole('button', { name: 'Open the case' }));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const [body, key] = open.mock.calls[0]!;
    expect(body).toEqual({
      contract_id: CONTRACT_ID,
      lawyer_employee_id: LAWYER_ID,
      court: 'Cairo Court',
      claim_amount: '10500.00',
      note: 'Start',
    });
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('The case page')).toBeInTheDocument();
  }, 20_000);

  it('offers the existing case when the contract already has an open one', async () => {
    const err = new ApiError(409, 'LEGAL_CASE_ALREADY_OPEN', 'x');
    err.details = { legal_case_id: CASE_ID };
    vi.spyOn(legalApi, 'open').mockRejectedValue(err);
    await renderButton();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Open legal case' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByLabelText('Claim')).toHaveValue('10500.00'));
    await user.click(within(dialog).getByRole('button', { name: 'Open the case' }));
    expect(
      await within(dialog).findByText('This contract already has an open legal case.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open the existing case' })).toHaveAttribute(
      'href',
      `/legal/cases/${CASE_ID}`,
    );
  }, 20_000);
});

describe('L01 who sees the open button', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('only the owner', async () => {
    signIn('CASHIER');
    await renderButton();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
  });

  it('not in a shop whose plan has no legal module', async () => {
    signIn('OWNER');
    vi.spyOn(subscriptionApi, 'status').mockResolvedValue({
      plan_key: 'retail',
      plan_name: 'Retail',
      subscription_end: null,
      days_left: null,
      state: 'active',
      read_only: false,
      usage: {} as never,
      modules: ['pos', 'installments'],
    } as never);
    await renderButton();
    await waitFor(() => expect(subscriptionApi.status).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: 'Open legal case' })).not.toBeInTheDocument();
  });
});
