import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { PermissionKey } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { meApi } from '@/features/me/meApi';
import { branchApi } from '@/services/branchApi';
import { purchaseInvoicesApi } from '@/services/purchaseInvoicesApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import PurchaseInvoicePage from './PurchaseInvoicePage';
import { INVOICE, LINE_PHONE, approval, branches, invoice } from './purchaseFixtures';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const page = (
  <Routes>
    <Route path="/purchasing/invoices/:id" element={<PurchaseInvoicePage />} />
  </Routes>
);
const route = `/purchasing/invoices/${INVOICE}`;
function setPermissions(keys: PermissionKey[]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}
const linesTable = () => screen.findByRole('table', { name: t('purchases.detail.lines') });

describe('U02 purchase invoice page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['purchase.invoice_create', 'purchase.invoice_approve']);
    vi.spyOn(branchApi, 'list').mockResolvedValue(
      branches as Awaited<ReturnType<typeof branchApi.list>>,
    );
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(invoice());
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('shows a draft in Arabic: header, lines and totals', async () => {
    await renderApp(page, { lang: 'ar', route });
    expect(
      await screen.findByRole('heading', {
        name: t('purchases.detail.title', { number: 'MAIN-PI-26-000001' }),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('مسودة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nile Traders' })).toHaveAttribute(
      'href',
      `/suppliers/${invoice().supplier_id}`,
    );
    const table = await linesTable();
    const tv = within(table).getByRole('row', { name: /TV-55/ });
    expect(within(tv).getByText('1,482.00 ج.م')).toBeInTheDocument();
    expect(screen.getByText('3,534.00 ج.م')).toBeInTheDocument();
    expect(screen.queryByText(t('purchases.detail.outstanding'))).not.toBeInTheDocument();
  });

  it('approve asks first and calls the API once (even on a double click)', async () => {
    const approve = vi
      .spyOn(purchaseInvoicesApi, 'approve')
      .mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve(invoice({ status: 'approved' })), 50)),
      );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.approve') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('purchases.detail.approveConfirm'))).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    await user.dblClick(
      within(dialog).getByRole('button', { name: t('purchases.detail.approve') }),
    );
    // No note on a draft (U06's owner note is for pending invoices only).
    await waitFor(() => expect(approve).toHaveBeenCalledWith(INVOICE, undefined));
    expect(await screen.findByText(t('purchases.detail.approved'))).toBeInTheDocument();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it('SERIALS_REQUIRED highlights the lines that need serials', async () => {
    vi.spyOn(purchaseInvoicesApi, 'approve').mockRejectedValue(
      Object.assign(new ApiError(422, 'SERIALS_REQUIRED', 'Serials.'), {
        details: { line_ids: [LINE_PHONE] },
      }),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.approve') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.approve') }));
    const table = await linesTable();
    const phone = await within(table).findByRole('row', { name: /PH-1/ });
    expect(within(phone).getByText(t('purchases.detail.needsSerials'))).toBeInTheDocument();
    expect(phone).toHaveAttribute('data-needs-serials', 'true');
    expect(within(table).getByRole('row', { name: /TV-55/ })).not.toHaveAttribute(
      'data-needs-serials',
    );
    expect(
      (await screen.findAllByText(t('purchases.errors.serialsRequired'))).length,
    ).toBeGreaterThan(0);
  });

  it('reject requires a reason of 3 to 500 characters', async () => {
    const reject = vi
      .spyOn(purchaseInvoicesApi, 'reject')
      .mockResolvedValue(invoice({ status: 'rejected', rejected_reason: 'Wrong prices' }));
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.reject') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.reject') }));
    expect(
      await within(dialog).findByText(t('purchases.detail.reasonInvalid')),
    ).toBeInTheDocument();
    expect(reject).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(t('purchases.detail.reason')), '  Wrong prices ');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.reject') }));
    await waitFor(() => expect(reject).toHaveBeenCalledWith(INVOICE, 'Wrong prices'));
  });

  it('an approved invoice shows what is owed and its serials, with no actions', async () => {
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(
      invoice({
        status: 'approved',
        outstanding: '3534.00',
        approved_at: '2026-10-11T09:00:00.000Z',
        approved_by_name: 'Owner',
        lines: invoice().lines.map((l) =>
          l.id === LINE_PHONE
            ? { ...l, serials: ['SN-1', 'SN-2'], unit_ids: [INVOICE, LINE_PHONE] }
            : l,
        ),
      }),
    );
    await renderApp(page, { lang: 'en', route });
    expect(await screen.findByText(t('purchases.detail.outstanding'))).toBeInTheDocument();
    expect(within(await linesTable()).getByText('SN-1, SN-2')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.approve') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: t('purchases.detail.edit') }),
    ).not.toBeInTheDocument();
  });

  it('hides edit, approve and reject without the permissions', async () => {
    setPermissions(['report.financial']);
    await renderApp(page, { lang: 'en', route });
    await linesTable();
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.approve') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.reject') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: t('purchases.detail.edit') }),
    ).not.toBeInTheDocument();
  });

  it('a warehouse user (create, not approve) sees Edit only', async () => {
    setPermissions(['purchase.invoice_create']);
    await renderApp(page, { lang: 'en', route });
    expect(await screen.findByRole('link', { name: t('purchases.detail.edit') })).toHaveAttribute(
      'href',
      `/purchasing/invoices/${INVOICE}/edit`,
    );
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.approve') }),
    ).not.toBeInTheDocument();
  });

  it('a non-UUID id makes no API call', async () => {
    const get = vi.spyOn(purchaseInvoicesApi, 'get');
    await renderApp(page, { lang: 'en', route: '/purchasing/invoices/not-a-uuid' });
    expect(await screen.findByText(t('purchases.detail.notFound'))).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it("another shop's or branch's invoice (404) shows not found", async () => {
    vi.spyOn(purchaseInvoicesApi, 'get').mockRejectedValue(
      new ApiError(404, 'PURCHASE_INVOICE_NOT_FOUND', 'Not found.'),
    );
    await renderApp(page, { lang: 'en', route });
    expect(await screen.findByText(t('purchases.detail.notFound'))).toBeInTheDocument();
  });

  it('U06: an approve answered pending_approval says it went to the owner', async () => {
    signIn('CASHIER');
    vi.spyOn(purchaseInvoicesApi, 'approve').mockResolvedValue(
      invoice({ status: 'pending_approval', approval: approval() }),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.approve') }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.approve') }));
    expect(
      await screen.findByText(t('purchases.approval.sent', { threshold: '1,000.00 EGP' })),
    ).toBeInTheDocument();
  });

  it('U06: a pending invoice shows the banner and no decision buttons to a non-owner', async () => {
    signIn('CASHIER');
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(
      invoice({ status: 'pending_approval', approval: approval() }),
    );
    await renderApp(page, { lang: 'en', route });
    expect(
      await screen.findByText(/Waiting for the owner: requested by Manager/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.approve') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('purchases.detail.reject') }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: t('purchases.detail.edit') }),
    ).not.toBeInTheDocument();
  });

  it('U06: the owner approves a pending invoice with a required note (ar)', async () => {
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(
      invoice({ status: 'pending_approval', approval: approval() }),
    );
    const approve = vi
      .spyOn(purchaseInvoicesApi, 'approve')
      .mockResolvedValue(
        invoice({ status: 'approved', approval: approval({ status: 'approved' }) }),
      );
    await renderApp(page, { lang: 'ar', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.approve') }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(t('purchases.approval.ownerApproveHelp'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.approve') }));
    expect(
      await within(dialog).findByText(t('purchases.approval.noteInvalid')),
    ).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(t('purchases.approval.note')), '  تمت المراجعة ');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.approve') }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith(INVOICE, 'تمت المراجعة'));
  });

  it('U06: APPROVAL_OWNER_ONLY is shown translated', async () => {
    vi.spyOn(purchaseInvoicesApi, 'get').mockResolvedValue(
      invoice({ status: 'pending_approval', approval: approval() }),
    );
    vi.spyOn(purchaseInvoicesApi, 'approve').mockRejectedValue(
      new ApiError(403, 'APPROVAL_OWNER_ONLY', 'Owner only.'),
    );
    await renderApp(page, { lang: 'en', route });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: t('purchases.detail.approve') }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(t('purchases.approval.note')), 'Looks right');
    await user.click(within(dialog).getByRole('button', { name: t('purchases.detail.approve') }));
    expect(
      await within(dialog).findByText(t('purchases.errors.approvalOwnerOnly')),
    ).toBeInTheDocument();
  });
});
