import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { legalApi } from '@/services/legalApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { CASE_ID, HEARING_ID, LAWYER_ID, legalDetail } from '@/test/legalFixtures';
import LegalCasePage from './LegalCasePage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const MANAGE = [
  'legal.view',
  'legal.manage',
  'customer.view_pii',
  'overdue.view',
] as PermissionKey[];

const renderCase = (lang: 'ar' | 'en' = 'en', id = CASE_ID) =>
  renderApp(
    <Routes>
      <Route path="/legal/cases/:id" element={<LegalCasePage />} />
    </Routes>,
    { lang, route: `/legal/cases/${id}` },
  );

function mockSession(keys: PermissionKey[], role: 'OWNER' | 'CASHIER' = 'OWNER') {
  signIn(role);
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys, { allBranches: true }));
  vi.spyOn(legalApi, 'lawyers').mockResolvedValue({
    items: [{ id: LAWYER_ID, full_name: 'Lawyer One', phone: null, open_cases: 1 }],
  });
  vi.spyOn(legalApi, 'files').mockResolvedValue({ items: [] });
}

describe('L01 legal case page', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows the details, the amounts and the collections since the case was opened; no collect button', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail());
    await renderCase();
    expect(
      await screen.findByRole('heading', { name: 'Case MAIN-LC-26-000001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cairo Economic Court')).toBeInTheDocument();
    expect(screen.getByText('123/2026')).toBeInTheDocument();
    expect(screen.getByText('Ahmed Adel')).toBeInTheDocument();
    const amounts = screen.getByTestId('legal-amounts');
    expect(amounts).toHaveTextContent(/11,000\.00/);
    expect(amounts).toHaveTextContent(/14,000\.00/);
    expect(amounts).toHaveTextContent(/1,000\.00/);
    expect(amounts).toHaveTextContent(/500\.00/);
    expect(amounts).toHaveTextContent(/10,500\.00/);
    expect(screen.getByText('MAIN-PY-26-000007')).toBeInTheDocument();
    expect(screen.getByText('Cashier One')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collect/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /collect/i })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/interest/i);
  });

  it('offers only the moves the server allows: preparing -> file (needs lawyer, court and number) or close', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(
      legalDetail({ lawyer: null, court: null, case_number: null }),
    );
    await renderCase();
    const file = await screen.findByRole('button', { name: 'File the case' });
    expect(file).toBeDisabled();
    expect(screen.getByText('To file the case, first assign a lawyer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close the case' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move to court' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record the judgment' })).not.toBeInTheDocument();
  });

  it('files a complete case and shows the answer', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail());
    const setStatus = vi
      .spyOn(legalApi, 'setStatus')
      .mockResolvedValue(legalDetail({ status: 'filed' }));
    await renderCase();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'File the case' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(CASE_ID, { status: 'filed' }));
    expect(await screen.findByRole('button', { name: 'Move to court' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'File the case' })).not.toBeInTheDocument();
  });

  it.each([
    ['filed', 'Move to court'],
    ['in_court', 'Record the judgment'],
    ['judgment', 'Appeal (back to court)'],
  ] as const)('%s offers the next move "%s" and no other forward move', async (status, label) => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status }));
    await renderCase();
    expect(await screen.findByRole('button', { name: label })).toBeEnabled();
    const moves = [
      'File the case',
      'Move to court',
      'Record the judgment',
      'Appeal (back to court)',
    ];
    for (const other of moves.filter((m) => m !== label)) {
      expect(screen.queryByRole('button', { name: other })).not.toBeInTheDocument();
    }
  });

  it('shows the refusal of a move in words, not the server text', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status: 'filed' }));
    vi.spyOn(legalApi, 'setStatus').mockRejectedValue(
      new ApiError(409, 'LEGAL_STATUS_INVALID', 'raw server text'),
    );
    await renderCase();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Move to court' }));
    expect(
      await screen.findByText("The case can't move to that status from where it is."),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('raw server text');
  });

  it('closing asks for how it ended; "Other" needs a note; it says nothing else changes', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status: 'judgment' }));
    const setStatus = vi.spyOn(legalApi, 'setStatus').mockResolvedValue(
      legalDetail({
        status: 'closed',
        outcome_kind: 'settled_out_of_court',
        outcome: 'Plan agreed',
        closed_at: '2026-10-26T09:00:00.000Z',
      }),
    );
    await renderCase();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Close the case' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(/changes nothing on the contract or the customer/),
    ).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Close the case' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('How did it end?'), 'other');
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Note (required for Other)'), 'See file');
    expect(confirm).toBeEnabled();
    await user.selectOptions(
      within(dialog).getByLabelText(/How did it end/),
      'settled_out_of_court',
    );
    await user.clear(within(dialog).getByLabelText(/Note/));
    await user.type(within(dialog).getByLabelText(/Note/), 'Plan agreed');
    await user.click(confirm);
    await waitFor(() =>
      expect(setStatus).toHaveBeenCalledWith(CASE_ID, {
        status: 'closed',
        outcome_kind: 'settled_out_of_court',
        outcome: 'Plan agreed',
      }),
    );
    expect(await screen.findByText('Closed: Settled out of court')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close the case' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a hearing' })).not.toBeInTheDocument();
  });

  it('adds a hearing and records its result', async () => {
    mockSession(MANAGE);
    const hearing = {
      id: HEARING_ID,
      hearing_date: '2026-11-15',
      outcome: null,
      notes: null,
      created_at: '2026-10-24T08:00:00.000Z',
    };
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ hearings: [hearing] }));
    const updateHearing = vi
      .spyOn(legalApi, 'updateHearing')
      .mockResolvedValue(legalDetail({ hearings: [{ ...hearing, outcome: 'Adjourned' }] }));
    const addHearing = vi.spyOn(legalApi, 'addHearing').mockResolvedValue(
      legalDetail({
        hearings: [
          hearing,
          { ...hearing, id: 'a1010000-0000-4000-8000-0000000000f2', hearing_date: '2026-12-01' },
        ],
      }),
    );
    await renderCase();
    const user = userEvent.setup();
    expect(await screen.findByText('No result recorded yet.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Record the result' }));
    let dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('What happened'), 'Adjourned');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateHearing).toHaveBeenCalledWith(CASE_ID, HEARING_ID, { outcome: 'Adjourned' }),
    );
    expect(await screen.findByText('Result: Adjourned')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a hearing' }));
    dialog = await screen.findByRole('dialog');
    const add = within(dialog).getByRole('button', { name: 'Add a hearing' });
    expect(add).toBeDisabled();
    expect(addHearing).not.toHaveBeenCalled();
    // A past date is fine (history): the day box takes the whole date.
    await user.type(within(dialog).getByLabelText('Hearing date'), '01122026');
    await user.type(within(dialog).getByLabelText('Notes (optional)'), 'Second session');
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    await waitFor(() =>
      expect(addHearing).toHaveBeenCalledWith(CASE_ID, {
        hearing_date: '2026-12-01',
        notes: 'Second session',
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Record the result' })).toHaveLength(2),
    );
  }, 30_000);

  it('adds a note (append only: no edit or delete) and the lawyer can add one too', async () => {
    mockSession(MANAGE, 'CASHIER');
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail());
    const addNote = vi.spyOn(legalApi, 'addNote').mockResolvedValue(
      legalDetail({
        notes: [
          {
            id: 'a1010000-0000-4000-8000-0000000000a6',
            note: 'Called the guarantor',
            created_at: '2026-10-26T08:00:00.000Z',
            created_by_name: 'Lawyer One',
          },
        ],
      }),
    );
    await renderCase();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('New note'), 'Called the guarantor');
    await user.click(screen.getByRole('button', { name: 'Add the note' }));
    await waitFor(() =>
      expect(addNote).toHaveBeenCalledWith(CASE_ID, { note: 'Called the guarantor' }),
    );
    expect(await screen.findByText('Called the guarantor')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete|remove/i })).not.toBeInTheDocument();
  });

  it('a reader without legal.manage sees the case but no action', async () => {
    mockSession(['legal.view'] as PermissionKey[], 'CASHIER');
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status: 'filed' }));
    await renderCase();
    expect(
      await screen.findByRole('heading', { name: 'Case MAIN-LC-26-000001' }),
    ).toBeInTheDocument();
    for (const name of [
      'Close the case',
      'Move to court',
      'Edit details',
      'Add a hearing',
      'Add the note',
      'Add a paper',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByLabelText('New note')).not.toBeInTheDocument();
  });

  it("edits the details; the lawyer picker is the owner's alone", async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail());
    const update = vi
      .spyOn(legalApi, 'update')
      .mockResolvedValue(legalDetail({ court: 'Giza Court' }));
    await renderCase();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Lawyer')).toBeInTheDocument();
    const court = within(dialog).getByLabelText('Court');
    await user.clear(court);
    await user.type(court, 'Giza Court');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(CASE_ID, { court: 'Giza Court' }));
    expect(await screen.findByText('Giza Court')).toBeInTheDocument();
  }, 20_000);

  it('a lawyer (not the owner) edits without a lawyer picker, and a filed case has a locked claim', async () => {
    mockSession(MANAGE, 'CASHIER');
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status: 'filed' }));
    await renderCase();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Lawyer')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/^Claim/)).toBeDisabled();
    expect(
      within(dialog).getByText("The claim can't change once the case is filed."),
    ).toBeInTheDocument();
  });

  it("says so when the case is not the caller's (another lawyer's or another shop's)", async () => {
    mockSession(MANAGE, 'CASHIER');
    vi.spyOn(legalApi, 'get').mockRejectedValue(new ApiError(404, 'LEGAL_CASE_NOT_FOUND', 'x'));
    await renderCase();
    expect(await screen.findByText('This case was not found')).toBeInTheDocument();
  });

  it('never asks the server for an id that is not a UUID', async () => {
    mockSession(MANAGE);
    const get = vi.spyOn(legalApi, 'get');
    await renderCase('en', 'not-a-uuid');
    expect(await screen.findByText('This case was not found')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('reads in Arabic', async () => {
    mockSession(MANAGE);
    vi.spyOn(legalApi, 'get').mockResolvedValue(legalDetail({ status: 'in_court' }));
    await renderCase('ar');
    expect(await screen.findByText('بيانات القضية')).toBeInTheDocument();
    expect(screen.getByText('منظورة')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تسجيل الحكم' })).toBeInTheDocument();
  });
});
