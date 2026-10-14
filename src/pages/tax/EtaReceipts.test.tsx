import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FiscalDetails,
  type FiscalListItem,
  type FiscalProblem,
  type FiscalSituation,
} from '@ziadkhaled-wb/contracts';
import { renderApp } from '@/test/renderApp';
import { fiscalApi } from '@/services/fiscalApi';
import FiscalAlertBadge from '@/features/fiscal/FiscalAlertBadge';
import EtaReceiptsPage from './EtaReceiptsPage';

const ID = 'a7030000-0000-4000-8000-000000000001';
const ID2 = 'a7030000-0000-4000-8000-000000000002';
const SALE = 'a7030000-0000-4000-8000-0000000000a1';
const PRODUCT = 'a7030000-0000-4000-8000-0000000000b1';
const CUSTOMER = 'a7030000-0000-4000-8000-0000000000c1';
const BRANCH = 'a7030000-0000-4000-8000-0000000000d1';
const permissions = vi.hoisted(() => ({ view: true, retry: true }));

vi.mock('@/features/me/useCan', () => ({
  useCan: (key: string) => (key === 'fiscal.view' ? permissions.view : permissions.retry),
}));
vi.mock('@/features/me/useBranches', () => ({
  useBranches: () => ({ data: [{ id: BRANCH, name: 'Main' }] }),
}));
vi.mock('@/features/me/useMe', () => ({
  useMe: () => ({ data: { org: { timezone: 'Africa/Cairo' } } }),
}));
vi.mock('@/services/etaApi', () => ({
  etaApi: { devices: vi.fn().mockResolvedValue([]) },
  etaKeys: { devices: (org: string | null) => ['eta', org, 'devices'] },
}));
vi.mock('@/services/fiscalApi', async (original) => ({
  ...(await original<typeof import('@/services/fiscalApi')>()),
  fiscalApi: {
    list: vi.fn(),
    summary: vi.fn(),
    get: vi.fn(),
    retry: vi.fn(),
    correct: vi.fn(),
    assignDevice: vi.fn(),
    checkNow: vi.fn(),
    retryMany: vi.fn(),
    daySummary: vi.fn(),
  },
}));

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function item(over: Partial<FiscalListItem> & { situation: FiscalSituation }): FiscalListItem {
  return {
    id: ID,
    sale_id: SALE,
    sale_number: 'SL-1',
    issued_at: at(-2),
    branch_id: BRANCH,
    branch_name: 'Main',
    device_id: null,
    device_name: 'POS 1',
    total: '1140.00',
    status: 'pending',
    short_error: null,
    deadline_at: at(20),
    deadline_state: 'ok',
    ...over,
  };
}

function details(
  situation: FiscalSituation,
  problems: FiscalProblem[],
  over: {
    action?: FiscalDetails['diagnosis']['action'];
    ready?: boolean;
    queued?: boolean;
    last_error?: string | null;
  } = {},
): FiscalDetails {
  return FiscalDetails.parse({
    row: {
      id: ID,
      doc_type: 'b2c_receipt',
      status: situation === 'rejected' ? 'rejected' : 'failed',
      situation,
      sale_number: 'SL-1',
      issued_at: at(-2),
      total: '1140.00',
      branch_id: BRANCH,
      branch_name: 'Main',
      device_id: null,
      device_name: null,
      environment: 'preprod',
      eta_uuid: situation === 'rejected' ? 'a'.repeat(64) : null,
      previous_uuid: '',
      reference_old_uuid: null,
      eta_long_id: null,
      eta_submission_uuid: null,
      attempts: 1,
      next_retry_at: null,
      last_error: over.last_error ?? null,
      submitted_at: null,
      accepted_at: null,
      created_at: at(-2),
      deadline_at: at(-1),
      deadline_state: 'overdue',
    },
    situation,
    diagnosis: {
      situation,
      action: over.action ?? null,
      ready: over.ready ?? false,
      correction_queued: over.queued ?? false,
      deadline_at: at(-1),
      deadline_state: 'overdue',
      problems,
    },
    events: [
      {
        id: 1,
        at: at(-2),
        old_status: null,
        new_status: 'pending',
        eta_uuid: null,
        message: null,
        actor_employee_id: null,
      },
      {
        id: 2,
        at: at(-1),
        old_status: 'pending',
        new_status: 'rejected',
        eta_uuid: 'a'.repeat(64),
        message: 'ETA_INVALID: bad',
        actor_employee_id: null,
      },
    ],
    sale: { id: SALE, number: 'SL-1' },
  });
}

const summary = {
  blocked: 2,
  send_failed: 1,
  rejected: 3,
  due_soon: 4,
  overdue: 5,
  accepted_today: 6,
};

async function open(sale = 'SL-1') {
  await userEvent.setup().click(await screen.findByRole('button', { name: `Receipt ${sale}` }));
}

beforeEach(() => {
  permissions.view = true;
  permissions.retry = true;
  vi.clearAllMocks();
  vi.mocked(fiscalApi.summary).mockResolvedValue(summary);
  vi.mocked(fiscalApi.list).mockResolvedValue({ items: [], total_count: 0 });
});

describe('T03 ETA receipts page', () => {
  it('the cards filter the list', async () => {
    const user = userEvent.setup();
    await renderApp(<EtaReceiptsPage />, { lang: 'en' });
    expect(await screen.findByText('5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Rejected/ }));
    await waitFor(() =>
      expect(fiscalApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ situation: 'rejected', offset: 0 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: /Accepted today/ }));
    await waitFor(() =>
      expect(fiscalApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ situation: 'accepted', from: expect.any(String) }),
      ),
    );
  });

  it('shows the situation badge, links the sale and colours an overdue deadline red', async () => {
    vi.mocked(fiscalApi.list).mockResolvedValue({
      items: [
        item({
          situation: 'rejected',
          status: 'rejected',
          deadline_state: 'overdue',
          deadline_at: at(-3),
        }),
        item({
          id: ID2,
          sale_number: 'SL-2',
          situation: 'blocked',
          status: 'failed',
          device_name: null,
          deadline_state: 'due_soon',
          deadline_at: at(2),
        }),
      ],
      total_count: 2,
    });
    await renderApp(<EtaReceiptsPage />, { lang: 'en' });
    const table = await screen.findByRole('table');
    expect(within(table).getByText('Rejected')).toHaveClass('badge-danger');
    expect(within(table).getByText('Blocked')).toHaveClass('badge-warning');
    expect(within(table).getByRole('link', { name: 'SL-1' })).toHaveAttribute(
      'href',
      `/sales/${SALE}`,
    );
    expect(table.querySelector('[data-deadline="overdue"]')).toHaveClass('text-danger-600');
    expect(table.querySelector('[data-deadline="due_soon"]')).not.toHaveClass('text-danger-600');
    expect(within(table).getByText('No POS')).toBeInTheDocument();
  });

  it('the drawer lists each problem with the right fix link', async () => {
    vi.mocked(fiscalApi.list).mockResolvedValue({
      items: [item({ situation: 'blocked', status: 'failed' })],
      total_count: 1,
    });
    vi.mocked(fiscalApi.get).mockResolvedValue(
      details(
        'blocked',
        [
          {
            code: 'ITEM_CODE',
            fixable: true,
            fix: 'product',
            products: [{ product_id: PRODUCT, name: 'Fan', sku: 'F1' }],
          },
          {
            code: 'SELLER_DATA',
            fixable: true,
            fix: 'branch',
            fields: [{ field: 'building_number', fix: 'branch' }],
          },
          {
            code: 'BUYER_ID',
            fixable: true,
            fix: 'customer',
            customer_id: CUSTOMER,
            reason: 'national_id',
          },
          { code: 'BUYER_MISSING', fixable: false, fix: null },
        ],
        { action: 'retry', ready: false },
      ),
    );
    await renderApp(<EtaReceiptsPage />, { lang: 'en' });
    await open();
    const link = (name: string) => screen.getByRole('link', { name });
    expect(link('Open the product')).toHaveAttribute('href', '/inventory/products');
    expect(link('Open the branch')).toHaveAttribute('href', '/settings/branches');
    expect(link('Open the customer')).toHaveAttribute('href', `/customers/${CUSTOMER}`);
    expect(screen.getByText('Fan')).toBeInTheDocument();
    expect(screen.getByText('Branch building number')).toBeInTheDocument();
    expect(screen.getByText(/cannot be changed: contact support/)).toBeInTheDocument();
    // Only the situation's action, disabled with a hint while not ready.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    expect(screen.getByText('Fix the problems above first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct and resend' })).not.toBeInTheDocument();
  });

  it('"Correct and resend" shows queued, then refreshes until the situation changes', async () => {
    vi.mocked(fiscalApi.list).mockResolvedValue({
      items: [item({ situation: 'rejected', status: 'rejected' })],
      total_count: 1,
    });
    const rejected = details(
      'rejected',
      [
        {
          code: 'ETA_REJECTED',
          fixable: true,
          fix: 'product',
          eta_error: {
            message: 'the item code is not registered',
            property_path: 'itemData[0].itemCode',
            details: [],
            nothing_changed: false,
          },
        },
      ],
      { action: 'correct', ready: true },
    );
    const queued = details('rejected', rejected.diagnosis.problems, {
      action: 'correct',
      ready: false,
      queued: true,
    });
    const accepted = details('accepted', [], {});
    vi.mocked(fiscalApi.get).mockResolvedValueOnce(rejected).mockResolvedValue(queued);
    vi.mocked(fiscalApi.correct).mockResolvedValue({ id: ID, status: 'rejected', queued: true });
    const user = userEvent.setup();
    await renderApp(<EtaReceiptsPage />, { lang: 'en' });
    await open();
    expect(await screen.findByText('the item code is not registered')).toBeInTheDocument();
    expect(screen.getByText('itemData[0].itemCode')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Correct and resend' }));
    expect(fiscalApi.correct).toHaveBeenCalledWith(ID);
    expect(await screen.findByText(/Correction queued. This updates/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Correct and resend/ })).toBeDisabled();
    vi.mocked(fiscalApi.get).mockResolvedValue(accepted);
    await waitFor(
      () => expect(within(screen.getByRole('dialog')).getByText('Accepted')).toBeInTheDocument(),
      { timeout: 8000 },
    );
    expect(screen.queryByRole('button', { name: /Correct and resend/ })).not.toBeInTheDocument();
  }, 15_000);

  it('bulk retry shows what was skipped and why', async () => {
    vi.mocked(fiscalApi.list).mockResolvedValue({
      items: [
        item({ situation: 'blocked', status: 'failed' }),
        item({ id: ID2, sale_number: 'SL-2', situation: 'rejected', status: 'rejected' }),
      ],
      total_count: 2,
    });
    vi.mocked(fiscalApi.retryMany).mockResolvedValue({
      done: 1,
      skipped: [{ id: ID2, reason: 'NOT_READY' }],
    });
    const user = userEvent.setup();
    await renderApp(<EtaReceiptsPage />, { lang: 'en' });
    await user.click(await screen.findByRole('checkbox', { name: 'SL-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'SL-2' }));
    await user.click(screen.getByRole('button', { name: 'Retry selected (2)' }));
    expect(fiscalApi.retryMany).toHaveBeenCalledWith([ID, ID2]);
    const result = await screen.findByTestId('bulk-result');
    expect(within(result).getByText('1 receipts were queued.')).toBeInTheDocument();
    expect(within(result).getByText('SL-2: its data still needs fixing')).toBeInTheDocument();
  });

  it('works in Arabic', async () => {
    vi.mocked(fiscalApi.list).mockResolvedValue({
      items: [item({ situation: 'blocked', status: 'failed' })],
      total_count: 1,
    });
    await renderApp(<EtaReceiptsPage />, { lang: 'ar' });
    expect(await screen.findByText('متوقف', { selector: 'span.badge' })).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('rtl');
  });
});

describe('T03 shell badge', () => {
  it('shows with fiscal.view and a count above zero, and links to the problems', async () => {
    await renderApp(<FiscalAlertBadge />, { lang: 'en' });
    const link = await screen.findByRole('link', { name: '15 ETA receipts need attention' });
    expect(link).toHaveAttribute('href', '/tax/eta-receipts?situation=problem');
  });

  it('is not drawn without fiscal.view (and asks nothing) or when nothing needs attention', async () => {
    permissions.view = false;
    const { unmount } = await renderApp(<FiscalAlertBadge />, { lang: 'en' });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(fiscalApi.summary).not.toHaveBeenCalled();
    unmount();
    permissions.view = true;
    vi.mocked(fiscalApi.summary).mockResolvedValue({
      blocked: 0,
      send_failed: 0,
      rejected: 0,
      due_soon: 0,
      overdue: 0,
      accepted_today: 9,
    });
    await renderApp(<FiscalAlertBadge />, { lang: 'en' });
    await waitFor(() => expect(fiscalApi.summary).toHaveBeenCalled());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
