import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { documentsFixture } from '@/features/contractDocuments/fixture';
import { contractDocumentsApi } from '@/services/contractDocumentsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ContractPrintPage from './ContractPrintPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID = 'a0770000-0000-4000-8000-0000000000d1';

const renderAt = (doc: 'contract' | 'notes', id = ID) =>
  renderApp(
    <Routes>
      <Route path="/contracts/:id/print" element={<ContractPrintPage />} />
    </Routes>,
    { lang: 'en', route: `/contracts/${id}/print?doc=${doc}` },
  );

describe('N07 contract print view', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['installment.create'] as PermissionKey[]),
    );
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('logs the print, then prints the original without a copy mark', async () => {
    vi.spyOn(contractDocumentsApi, 'get').mockResolvedValue(documentsFixture());
    const log = vi
      .spyOn(contractDocumentsApi, 'recordPrint')
      .mockResolvedValue({ print_no: 1, copy: false });
    let printed: { root: boolean; mark: boolean } | null = null;
    vi.spyOn(window, 'print').mockImplementation(() => {
      printed = {
        root: !!document.querySelector('.print-root [data-testid="contract-document"]'),
        mark: !!document.querySelector('.print-root [data-testid="copy-mark"]'),
      };
    });
    await renderAt('contract');
    expect(await screen.findByText('Print contract MAIN-CT-26-000007')).toBeInTheDocument();
    expect(screen.getByText('This print will be the original.')).toBeInTheDocument();
    expect(screen.queryByTestId('copy-mark')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
    expect(log).toHaveBeenCalledWith(ID, 'contract');
    expect(printed).toEqual({ root: true, mark: false });
  });

  it('shows the COPY mark when the contract was printed before, and the server can make it one', async () => {
    const get = vi.spyOn(contractDocumentsApi, 'get').mockResolvedValue(
      documentsFixture({
        prints: {
          contract: { next_print_no: 2, copy: true },
          promissory_notes: { next_print_no: 1, copy: false },
        },
      }),
    );
    vi.spyOn(contractDocumentsApi, 'recordPrint').mockResolvedValue({ print_no: 2, copy: true });
    let mark = false;
    vi.spyOn(window, 'print').mockImplementation(() => {
      mark = !!document.querySelector('.print-root [data-testid="copy-mark"]');
    });
    await renderAt('contract');
    expect(await screen.findByTestId('copy-mark')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(mark).toBe(true);
    // The read is repeated afterwards so the next print number is right.
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1));
  });

  it('prints a COPY when the print cannot be logged (an expired shop)', async () => {
    vi.spyOn(contractDocumentsApi, 'get').mockResolvedValue(documentsFixture());
    vi.spyOn(contractDocumentsApi, 'recordPrint').mockRejectedValue(
      new ApiError(403, 'SUBSCRIPTION_EXPIRED', 'expired'),
    );
    let mark = false;
    vi.spyOn(window, 'print').mockImplementation(() => {
      mark = !!document.querySelector('.print-root [data-testid="copy-mark"]');
    });
    await renderAt('contract');
    await userEvent.click(await screen.findByRole('button', { name: 'Print' }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(mark).toBe(true);
    expect(
      await screen.findByText('The print could not be logged, so this paper is marked COPY.'),
    ).toBeInTheDocument();
  });

  it('prints the promissory notes, three to a page, and logs the notes document', async () => {
    vi.spyOn(contractDocumentsApi, 'get').mockResolvedValue(documentsFixture());
    const log = vi
      .spyOn(contractDocumentsApi, 'recordPrint')
      .mockResolvedValue({ print_no: 1, copy: false });
    vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await renderAt('notes');
    expect(await screen.findAllByTestId('promissory-note')).toHaveLength(3);
    expect(screen.getByText('3 promissory notes, three to an A4 page.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(log).toHaveBeenCalledWith(ID, 'promissory_notes'));
  });

  it('has nothing to print for the notes of a closed contract', async () => {
    vi.spyOn(contractDocumentsApi, 'get').mockResolvedValue(
      documentsFixture({ notes: [], status_mark: 'completed' }),
    );
    await renderAt('notes');
    expect(
      await screen.findByText(
        'There are no promissory notes to print: the contract is closed or nothing is left to pay.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('says so when the contract is not found or printing is not allowed', async () => {
    vi.spyOn(contractDocumentsApi, 'get').mockRejectedValue(
      new ApiError(404, 'CONTRACT_NOT_FOUND', 'x'),
    );
    const { unmount } = await renderAt('contract');
    expect(await screen.findByText('This contract was not found.')).toBeInTheDocument();
    unmount();
    vi.spyOn(contractDocumentsApi, 'get').mockRejectedValue(
      new ApiError(403, 'PERMISSION_DENIED', 'x'),
    );
    await renderAt('contract');
    expect(await screen.findByText('You are not allowed to print contracts.')).toBeInTheDocument();
  });
});
