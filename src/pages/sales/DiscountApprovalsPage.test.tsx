import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { DiscountApproval } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequirePermission from '@/components/guards/RequirePermission';
import { filterNav, NAV } from '@/config/navigation';
import DiscountApprovalsBadge from '@/features/approvals/DiscountApprovalsBadge';
import { meApi } from '@/features/me/meApi';
import { ApiError, api } from '@/lib/api';
import { approvalsApi } from '@/services/approvalsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import { t } from '@/i18n';
import DiscountApprovalsPage from './DiscountApprovalsPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const ID_1 = 'a0630000-0000-4000-8000-000000000001';
const ID_2 = 'a0630000-0000-4000-8000-000000000002';
const BRANCH = 'a0630000-0000-4000-8000-000000000003';
const PRODUCT = 'a0630000-0000-4000-8000-000000000004';
const ts = '2026-10-12T08:00:00.000Z';

const approval = (over: Partial<DiscountApproval> = {}): DiscountApproval => ({
  id: ID_1,
  status: 'pending',
  branch_id: BRANCH,
  branch_name: 'Main branch',
  requested_by_name: 'Mona Cashier',
  requested_at: ts,
  max_effective_pct: '8.00',
  cap_pct: '5.00',
  discount_total: '91.20',
  reason: 'Regular customer, 8% agreed',
  lines: [
    {
      product_id: PRODUCT,
      sku: 'S3-TV',
      name_ar: 'تلفزيون',
      name_en: 'TV',
      quantity: 1,
      unit_price: '1140.00',
      discount_amount: '91.20',
      effective_pct: '8.00',
    },
  ],
  decided_by_name: null,
  decided_at: null,
  decision_note: null,
  used: false,
  ...over,
});

function setPermissions(keys: Parameters<typeof permissionsFixture>[0]) {
  vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(keys));
}

describe('S03 manager approvals page', () => {
  beforeEach(() => {
    signIn();
    setPermissions(['discount.above_cap']);
  });

  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('lists the waiting requests with who, where, the percent, the limit, the items and the reason (English)', async () => {
    const list = vi.spyOn(approvalsApi, 'list').mockResolvedValue({ items: [approval()] });
    await renderApp(<DiscountApprovalsPage />, { lang: 'en' });
    expect(await screen.findByText('Requested by Mona Cashier')).toBeInTheDocument();
    expect(list).toHaveBeenCalledWith('pending');
    expect(screen.getByText(/Main branch/)).toBeInTheDocument();
    expect(screen.getByText('8.00%')).toBeInTheDocument();
    expect(screen.getByText('5.00%')).toBeInTheDocument();
    expect(screen.getByText(/TV × 1: −.*91\.20.* \(8\.00%\)/)).toBeInTheDocument();
    expect(screen.getByText('Regular customer, 8% agreed')).toBeInTheDocument();
  });

  it('shows the same in Arabic with the Arabic product name', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue({ items: [approval()] });
    await renderApp(<DiscountApprovalsPage />, { lang: 'ar' });
    expect(await screen.findByText('طلبها Mona Cashier')).toBeInTheDocument();
    expect(screen.getByText(/تلفزيون × 1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'موافقة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رفض' })).toBeInTheDocument();
  });

  it('an empty list says nothing is waiting', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue({ items: [] });
    await renderApp(<DiscountApprovalsPage />, { lang: 'en' });
    expect(await screen.findByText(t('sales.approvals.empty'))).toBeInTheDocument();
  });

  it('approve sends the right body with the note, then the list and the badge update', async () => {
    const list = vi
      .spyOn(approvalsApi, 'list')
      .mockResolvedValueOnce({ items: [approval(), approval({ id: ID_2 })] })
      .mockResolvedValue({ items: [approval({ id: ID_2 })] });
    const decide = vi
      .spyOn(approvalsApi, 'decideApproval')
      .mockResolvedValue({ status: 'approved' });
    await renderApp(
      <>
        <DiscountApprovalsBadge />
        <DiscountApprovalsPage />
      </>,
      { lang: 'en' },
    );
    const user = userEvent.setup();
    expect(await screen.findByLabelText('2 waiting')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Approve this discount?' });
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Fine');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith(ID_1, { approve: true, note: 'Fine' }));
    await waitFor(() => expect(screen.getByLabelText('1 waiting')).toBeInTheDocument());
    expect(
      screen.getAllByRole('listitem').filter((li) => li.textContent?.includes('Requested by')),
    ).toHaveLength(1);
    expect(list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('reject sends approve false and no note when none is typed; a refusal is shown in the dialog', async () => {
    vi.spyOn(approvalsApi, 'list').mockResolvedValue({ items: [approval()] });
    const decide = vi
      .spyOn(approvalsApi, 'decideApproval')
      .mockRejectedValueOnce(new ApiError(403, 'APPROVAL_SELF', 'refused'))
      .mockResolvedValue({ status: 'rejected' });
    await renderApp(<DiscountApprovalsPage />, { lang: 'en' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reject this discount?' });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(
      await within(dialog).findByText('You can not decide your own request.'),
    ).toBeInTheDocument();
    expect(decide).toHaveBeenLastCalledWith(ID_1, { approve: false });
    await user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('S03 approvals are hidden without discount.above_cap', () => {
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('the page is the 403 page without the permission, and nothing is asked of the server', async () => {
    signIn('CASHIER');
    setPermissions(['sale.create']);
    const list = vi.spyOn(approvalsApi, 'list').mockResolvedValue({ items: [] });
    await renderApp(
      <Routes>
        <Route element={<RequirePermission permission="discount.above_cap" />}>
          <Route path="/sales/approvals" element={<DiscountApprovalsPage />} />
        </Route>
      </Routes>,
      { lang: 'en', route: '/sales/approvals' },
    );
    expect(await screen.findByText(t('shell.forbidden.title'))).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('the menu has the item (with its badge) only with the permission', () => {
    const user = {
      id: 'u',
      email: 'e@example.com',
      username: null,
      role: 'CASHIER' as const,
      permissions: ['sale.create'],
      mustChangePassword: false,
    };
    const ids = (permissions: string[]) =>
      filterNav(NAV, { ...user, permissions })
        .flatMap((i) => i.children ?? [i])
        .map((i) => i.id);
    expect(ids(['sale.create'])).not.toContain('discount-approvals');
    expect(ids(['sale.create', 'discount.above_cap'])).toContain('discount-approvals');
    const item = NAV.flatMap((i) => i.children ?? [i]).find((i) => i.id === 'discount-approvals');
    expect(item?.badge).toBe(DiscountApprovalsBadge);
    expect(item?.to).toBe('/sales/approvals');
  });
});

describe('S03 approvals API client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('the list asks for the discount kind and a status; decide posts the body', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [approval()] } });
    expect((await approvalsApi.list()).items).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/api/approvals', {
      params: { kind: 'discount_above_cap', status: 'pending' },
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { status: 'approved' } });
    await approvalsApi.decideApproval(ID_1, { approve: true, note: 'Fine' });
    expect(post).toHaveBeenCalledWith(`/api/approvals/${ID_1}/decide`, {
      approve: true,
      note: 'Fine',
    });
  });

  it('the cashier calls: request, read and cancel', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { approval_id: ID_1, max_effective_pct: '8.00', cap_pct: '5.00' },
    });
    const body = {
      branch_id: BRANCH,
      lines: [
        { product_id: PRODUCT, quantity: 1, discount: { type: 'percent' as const, value: '8' } },
      ],
      reason: 'Regular customer',
    };
    expect((await approvalsApi.requestDiscountApproval(body)).approval_id).toBe(ID_1);
    expect(post).toHaveBeenLastCalledWith('/api/sales/discount-approvals', body);
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: approval({ status: 'approved' }) });
    expect((await approvalsApi.getDiscountApproval(ID_1)).status).toBe('approved');
    expect(get).toHaveBeenLastCalledWith(`/api/sales/discount-approvals/${ID_1}`);
    post.mockResolvedValue({ data: { status: 'cancelled' } });
    expect((await approvalsApi.cancelDiscountApproval(ID_1)).status).toBe('cancelled');
    expect(post).toHaveBeenLastCalledWith(`/api/sales/discount-approvals/${ID_1}/cancel`);
  });
});
