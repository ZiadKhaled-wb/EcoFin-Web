import { beforeEach, describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { WarrantyClaim, WarrantyLine, type ClaimStatus } from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { warrantyApi } from '@/services/warrantyApi';
import { unitsApi } from '@/services/unitsApi';
import WarrantyPage from './WarrantyPage';
import OpenWarrantyClaimDialog from './OpenWarrantyClaimDialog';
import { WarrantyClaimActions } from './WarrantyClaimPage';
import { allowedClaimActions } from './warrantyRules';
import WarrantyClaimPrintPage, { WarrantyReceipt } from './WarrantyClaimPrintPage';
const ID = 'a7120000-0000-4000-8000-000000000001',
  B = 'a7120000-0000-4000-8000-000000000002';
const permission = vi.hoisted(() => ({ manager: true }));
vi.mock('@/features/me/useCan', () => ({
  useCan: (key: string) => key === 'warranty.manage' || permission.manager,
}));
vi.mock('@/features/me/useMe', () => ({
  useMe: () => ({ data: { org: { name: 'Eco shop' } }, isError: false }),
}));
vi.mock('@/features/me/useBranches', () => ({
  useBranches: () => ({ data: [{ id: ID, name: 'Main' }] }),
}));
vi.mock('@/services/warrantyApi', () => ({
  warrantyKeys: { all: (org: string | null) => ['warranty', org] },
  warrantyApi: {
    lookup: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    open: vi.fn(),
    move: vi.fn(),
    uploadPhoto: vi.fn(),
    photoUrl: vi.fn(),
  },
}));
vi.mock('@/services/unitsApi', () => ({ unitsApi: { search: vi.fn() } }));
const line = WarrantyLine.parse({
  sale_line_id: ID,
  product: { id: ID, name: 'Phone', sku: 'PH', serialized: true },
  quantity: 1,
  branch: { id: ID, name: 'Main' },
  customer: { id: ID, name: 'Mona' },
  sale_id: ID,
  sale_number: 'SL-1',
  sale_date: '2026-10-12',
  warranty_until: '2027-10-11',
  in_warranty: true,
  unit_id: ID,
  serial: 'SER-A',
  chain: [
    { unit_id: ID, serial: 'SER-A', at: '2026-10-12T12:00:00Z', warranty_until: '2027-10-11' },
  ],
  claims: [],
});
const claim = WarrantyClaim.parse({
  id: ID,
  number: 'WC-1',
  branch_id: ID,
  sale_line_id: ID,
  unit_id: ID,
  replacement_unit_id: null,
  status: 'open',
  issue: 'Screen failed',
  resolution: 'Received: Scratched case',
  out_of_warranty: false,
  created_at: '2026-10-13T12:00:00Z',
  closed_at: null,
  line,
  files: [],
  history: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  permission.manager = true;
  vi.mocked(warrantyApi.list).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(unitsApi.search).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
});
describe('S12 warranty UI', () => {
  it.each(['ar', 'en'] as const)('print route mounts a body print portal in %s', async (lang) => {
    vi.mocked(warrantyApi.get).mockResolvedValue(claim);
    await renderApp(
      <Routes>
        <Route path="/warranty/claims/:id/print" element={<WarrantyClaimPrintPage />} />
      </Routes>,
      { lang, route: '/warranty/claims/' + ID + '/print' },
    );
    await waitFor(() => expect(document.body.querySelector('.print-root')).not.toBeNull());
    const portal = document.body.querySelector('.print-root') as HTMLElement;
    expect(portal.parentElement).toBe(document.body);
    expect(portal.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    expect(within(portal).getByText('WC-1')).toBeInTheDocument();
  });
  it('tabs support arrow-key navigation', async () => {
    const user = userEvent.setup();
    await renderApp(<WarrantyPage />, { lang: 'en' });
    const lookup = screen.getByRole('tab', { name: 'Lookup' });
    lookup.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Claims' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Claims' })).toHaveFocus();
  });

  it('lookup shows in/out badges and serial history', async () => {
    vi.mocked(warrantyApi.lookup).mockResolvedValue({
      items: [
        line,
        {
          ...line,
          sale_line_id: B,
          in_warranty: false,
          warranty_until: null,
          product: { ...line.product, name: 'Chair' },
        },
      ],
    });
    const user = userEvent.setup();
    await renderApp(<WarrantyPage />, { lang: 'en' });
    await user.type(screen.getByLabelText('Serial, phone or sale number'), 'SER-A');
    await user.click(screen.getByRole('button', { name: 'Lookup' }));
    expect(await screen.findByText('In warranty')).toBeInTheDocument();
    expect(screen.getByText('Out of warranty')).toHaveClass('badge-danger');
    expect(warrantyApi.lookup).toHaveBeenCalledWith({ serial: 'SER-A' });
    expect(screen.getAllByText('SER-A')).toHaveLength(2);
  });
  it('claim list sends out-of-warranty filter and renders red badge', async () => {
    vi.mocked(warrantyApi.list).mockResolvedValue({
      items: [{ ...claim, out_of_warranty: true }],
      total: 1,
    });
    const user = userEvent.setup();
    await renderApp(<WarrantyPage />, { lang: 'en' });
    await user.click(screen.getByRole('tab', { name: 'Claims' }));
    expect(await screen.findByText('WC-1')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Warranty coverage'), 'true');
    await waitFor(() =>
      expect(warrantyApi.list).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20,
        out_of_warranty: true,
      }),
    );
    expect(
      screen.getAllByText('Out of warranty').some((el) => el.classList.contains('badge-danger')),
    ).toBe(true);
  });
  it('open dialog validates, sends a UUID key and navigates to claim', async () => {
    vi.mocked(warrantyApi.open).mockResolvedValue({
      claim_id: ID,
      number: 'WC-1',
      out_of_warranty: false,
    });
    const user = userEvent.setup();
    await renderApp(
      <Routes>
        <Route path="/" element={<OpenWarrantyClaimDialog line={line} onClose={() => {}} />} />
        <Route path="/warranty/claims/:id" element={<p>Claim opened</p>} />
      </Routes>,
      { lang: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Open claim' }));
    expect(warrantyApi.open).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Issue'), 'Screen failed');
    await user.type(screen.getByLabelText('Received condition'), 'Scratched case');
    await user.click(screen.getByRole('button', { name: 'Open claim' }));
    expect(await screen.findByText('Claim opened')).toBeInTheDocument();
    expect(warrantyApi.open).toHaveBeenCalledWith(
      { sale_line_id: ID, unit_id: ID, issue: 'Screen failed', condition: 'Scratched case' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
  it('photo retry uploads only remaining files and does not create another claim', async () => {
    vi.mocked(warrantyApi.open).mockResolvedValue({
      claim_id: ID,
      number: 'WC-1',
      out_of_warranty: false,
    });
    vi.mocked(warrantyApi.uploadPhoto)
      .mockResolvedValueOnce({
        id: ID,
        purpose: 'other',
        mime: 'image/png',
        sizeBytes: 1,
        originalName: 'a.png',
        entityType: 'warranty_claim',
        entityId: ID,
        createdAt: '2026-10-13T12:00:00Z',
      })
      .mockRejectedValueOnce(new Error('Upload failed'))
      .mockResolvedValueOnce({
        id: B,
        purpose: 'other',
        mime: 'image/png',
        sizeBytes: 1,
        originalName: 'b.png',
        entityType: 'warranty_claim',
        entityId: ID,
        createdAt: '2026-10-13T12:00:00Z',
      });
    const user = userEvent.setup();
    await renderApp(
      <Routes>
        <Route path="/" element={<OpenWarrantyClaimDialog line={line} onClose={() => {}} />} />
        <Route path="/warranty/claims/:id" element={<p>Claim opened</p>} />
      </Routes>,
      { lang: 'en' },
    );
    await user.type(screen.getByLabelText('Issue'), 'Screen failed');
    await user.type(screen.getByLabelText('Received condition'), 'Scratched case');
    await user.upload(screen.getByLabelText('Photos'), [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]);
    await user.click(screen.getByRole('button', { name: 'Open claim' }));
    await user.click(await screen.findByRole('button', { name: 'Retry remaining photos' }));
    expect(await screen.findByText('Claim opened')).toBeInTheDocument();
    expect(warrantyApi.open).toHaveBeenCalledTimes(1);
    expect(warrantyApi.uploadPhoto).toHaveBeenCalledTimes(3);
    expect(vi.mocked(warrantyApi.uploadPhoto).mock.calls.map((c) => c[1].name)).toEqual([
      'a.png',
      'b.png',
      'b.png',
    ]);
  });
  it.each([
    ['open', ['in_repair', 'replaced', 'rejected']],
    ['in_repair', ['repaired', 'replaced', 'rejected']],
    ['repaired', ['closed']],
    ['replaced', ['closed']],
    ['closed', []],
    ['rejected', []],
  ] as [ClaimStatus, ClaimStatus[]][])(
    'only allowed actions for %s; refund (S05) only while the claim is open',
    async (status, expected) => {
      const c = { ...claim, status };
      expect(allowedClaimActions(c, true)).toEqual(expected);
      await renderApp(<WarrantyClaimActions claim={c} />, { lang: 'en' });
      const refundable = ['open', 'in_repair', 'repaired'].includes(status);
      const refund = screen.queryByRole('button', { name: /refund/i });
      if (refundable) expect(refund).toBeInTheDocument();
      else expect(refund).not.toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(expected.length + (refundable ? 1 : 0));
    },
  );
  it('expired cashier sees Reject only', async () => {
    permission.manager = false;
    await renderApp(<WarrantyClaimActions claim={{ ...claim, out_of_warranty: true }} />, {
      lang: 'en',
    });
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for repair' })).not.toBeInTheDocument();
    expect(screen.getByText(/need a manager decision/)).toBeInTheDocument();
  });
  it('replacement picker excludes foreign product/branch and posts selected serial', async () => {
    const row = {
      id: B,
      serial: 'SER-B',
      product_id: ID,
      branch_id: ID,
      branch_name: 'Main',
      name_ar: 'Phone',
      name_en: null,
      sku: 'PH',
      status: 'in_stock' as const,
    };
    vi.mocked(unitsApi.search).mockResolvedValue({
      items: [
        row,
        {
          ...row,
          id: 'a7120000-0000-4000-8000-000000000003',
          serial: 'WRONG-PRODUCT',
          product_id: B,
        },
        {
          ...row,
          id: 'a7120000-0000-4000-8000-000000000004',
          serial: 'WRONG-BRANCH',
          branch_id: B,
        },
      ],
      total: 3,
      page: 1,
      pageSize: 100,
    });
    vi.mocked(warrantyApi.move).mockResolvedValue({
      ...claim,
      status: 'replaced',
      replacement_unit_id: B,
    });
    const user = userEvent.setup();
    await renderApp(<WarrantyClaimActions claim={claim} />, { lang: 'en' });
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('option', { name: 'SER-B' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WRONG-PRODUCT' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WRONG-BRANCH' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Replacement unit'), B);
    await user.type(screen.getByLabelText('Decision note'), 'Supplier replacement');
    await user.click(screen.getByRole('button', { name: 'Confirm decision' }));
    await waitFor(() =>
      expect(warrantyApi.move).toHaveBeenCalledWith(ID, {
        to: 'replaced',
        note: 'Supplier replacement',
        replacement_unit_id: B,
      }),
    );
  });
  it.each(['ar', 'en'] as const)(
    'receipt shows fields, condition and expired mark in %s',
    async (lang) => {
      await renderApp(
        <WarrantyReceipt claim={{ ...claim, out_of_warranty: true }} shop="Eco shop" />,
        { lang },
      );
      expect(screen.getByText('Eco shop')).toBeInTheDocument();
      for (const text of [
        'WC-1',
        'SL-1',
        'SER-A',
        'Mona',
        'Phone',
        'Screen failed',
        'Scratched case',
      ])
        expect(screen.getByText(text)).toBeInTheDocument();
      expect(
        screen.getByText(lang === 'ar' ? 'خارج الضمان' : 'Out of warranty'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(lang === 'ar' ? 'توقيع العميل' : 'Customer signature'),
      ).toBeInTheDocument();
      expect(document.documentElement.dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
    },
  );
});
