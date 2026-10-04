import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuditRow, AuditSearchResponse } from '@ziadkhaled-wb/contracts';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from '@/components/guards/RequireAuth';
import RequirePermission from '@/components/guards/RequirePermission';
import { auditApi } from '@/features/audit/auditApi';
import { meApi } from '@/features/me/meApi';
import { setLanguage, t } from '@/i18n';
import AuditPage from '@/pages/AuditPage';
import {
  BRANCH_MAIN,
  meFixture,
  permissionsFixture,
  renderApp,
  signIn,
  signOut,
} from '@/test/renderApp';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/features/audit/auditApi', () => ({ auditApi: { search: vi.fn() } }));
vi.mock('@/features/me/meApi', () => ({ meApi: { me: vi.fn(), permissions: vi.fn() } }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const CASHIER = '22222222-2222-4222-8222-222222222222';

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 1,
  branchId: BRANCH_MAIN,
  employeeId: OWNER,
  actorName: 'Owner One',
  superAdminId: null,
  deviceId: null,
  ip: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  requestId: 'req-1',
  action: 'auth.login',
  entityType: null,
  entityId: null,
  severity: 'info',
  reason: null,
  before: null,
  after: null,
  createdAt: '2026-10-04T10:30:00.000Z',
  ...over,
});

const page = (items: AuditRow[], over: Partial<AuditSearchResponse> = {}) => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  ...over,
});

const permissionChange = row({
  id: 2,
  action: 'employee.permission_set',
  entityType: 'employee',
  entityId: CASHIER,
  reason: 'covering the evening shift',
  before: { permission_key: 'sale.void', effective: false },
  after: { permission_key: 'sale.void', effective: true },
});

const routes = (
  <Routes>
    <Route element={<RequireAuth />}>
      <Route element={<RequirePermission permission="audit.view" />}>
        <Route path="/audit" element={<AuditPage />} />
      </Route>
    </Route>
    <Route path="/login" element={<p>login page</p>} />
  </Routes>
);

/** Rows live in the table; the same labels also appear as filter options. */
const table = async () => screen.findByRole('table', { name: t('audit.caption') });

const lastQuery = () => vi.mocked(auditApi.search).mock.calls.at(-1)?.[0];

beforeEach(() => {
  signIn('OWNER');
  vi.mocked(meApi.me).mockResolvedValue(meFixture());
  vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['audit.view']));
  vi.mocked(auditApi.search).mockResolvedValue(page([row(), permissionChange]));
});
afterEach(async () => {
  signOut();
  vi.clearAllMocks();
  await setLanguage('ar');
});

describe('AuditPage', () => {
  it.each(['ar', 'en'] as const)('renders the rows in %s with translated actions', async (lang) => {
    await renderApp(routes, { lang, route: '/audit' });
    expect(await screen.findByRole('heading', { name: t('audit.title') })).toBeInTheDocument();
    const tbl = await table();
    expect(await within(tbl).findByText(t('audit.actions.auth_login'))).toBeInTheDocument();
    expect(within(tbl).getByText(t('audit.actions.employee_permission_set'))).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: t('audit.filterByPerson', { name: 'Owner One' }) }),
    ).toHaveLength(2);
    expect(screen.getAllByText('Main branch').length).toBeGreaterThan(0);
    expect(document.documentElement).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    expect(lastQuery()).toEqual({ page: 1, pageSize: 25 });
  });

  it('an unknown action shows its raw key; a platform action shows "System"', async () => {
    vi.mocked(auditApi.search).mockResolvedValue(
      page([row({ action: 'sale.create', employeeId: null, actorName: null })]),
    );
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(await screen.findByText('sale.create')).toBeInTheDocument();
    expect(screen.getByText(t('audit.system'))).toBeInTheDocument();
  });

  it('filters change the request and go back to page 1', async () => {
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en', route: '/audit?page=2' });
    await within(await table()).findByText(t('audit.actions.auth_login'));
    expect(lastQuery()).toMatchObject({ page: 2 });

    await user.selectOptions(screen.getByLabelText(t('audit.filters.action')), 'auth.login');
    await waitFor(() =>
      expect(lastQuery()).toEqual({ page: 1, pageSize: 25, action: 'auth.login' }),
    );

    await user.selectOptions(screen.getByLabelText(t('audit.filters.entityType')), 'employee');
    await user.selectOptions(screen.getByLabelText(t('audit.filters.branch')), BRANCH_MAIN);
    await waitFor(() =>
      expect(lastQuery()).toMatchObject({
        action: 'auth.login',
        entityType: 'employee',
        branchId: BRANCH_MAIN,
      }),
    );

    await user.type(screen.getByLabelText(t('audit.filters.from')), '2026-10-01');
    await waitFor(() =>
      expect(lastQuery()?.from).toBe(new Date('2026-10-01T00:00:00').toISOString()),
    );

    await user.click(screen.getByRole('button', { name: t('audit.filters.clear') }));
    await waitFor(() => expect(lastQuery()).toEqual({ page: 1, pageSize: 25 }));
  });

  it("clicking a person's name filters by that person; the chip clears it", async () => {
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en', route: '/audit' });
    const [name] = await screen.findAllByRole('button', {
      name: t('audit.filterByPerson', { name: 'Owner One' }),
    });
    await user.click(name!);
    await waitFor(() =>
      expect(lastQuery()).toEqual({ page: 1, pageSize: 25, actorEmployeeId: OWNER }),
    );
    expect(screen.getByText(t('audit.filters.person', { name: 'Owner One' }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: t('audit.filters.clearPerson') }));
    await waitFor(() => expect(lastQuery()).toEqual({ page: 1, pageSize: 25 }));
  });

  it('server pagination: Next asks for page 2', async () => {
    const user = userEvent.setup();
    vi.mocked(auditApi.search).mockResolvedValue(page([row()], { total: 60 }));
    await renderApp(routes, { lang: 'en', route: '/audit' });
    await within(await table()).findByText(t('audit.actions.auth_login'));
    expect(screen.getByRole('navigation', { name: t('table.pagination') })).toHaveTextContent(
      t('table.pageOf', { page: '1', pages: '3' }),
    );
    await user.click(screen.getByRole('button', { name: t('table.next') }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ page: 2 }));
  });

  it('the details drawer shows the entry with readable before/after values', async () => {
    const user = userEvent.setup();
    await renderApp(routes, { lang: 'en', route: '/audit' });
    const tbl = await table();
    await within(tbl).findByText(t('audit.actions.employee_permission_set'));
    const buttons = within(tbl).getAllByRole('button', { name: t('audit.openDetails') });
    await user.click(buttons[1]!);
    const drawer = await screen.findByRole('dialog', { name: t('audit.detail.title') });
    expect(within(drawer).getByText('covering the evening shift')).toBeInTheDocument();
    const before = within(drawer).getByRole('region', { name: t('audit.detail.before') });
    const after = within(drawer).getByRole('region', { name: t('audit.detail.after') });
    expect(before).toHaveTextContent('"effective": false');
    expect(after).toHaveTextContent('"effective": true');
    expect(
      within(after)
        .getByText(/sale\.void/)
        .closest('pre'),
    ).toHaveAttribute('dir', 'ltr');
  });

  it('an error shows the retry state', async () => {
    vi.mocked(auditApi.search).mockRejectedValue(new Error('boom'));
    await renderApp(routes, { lang: 'en', route: '/audit' });
    expect(await screen.findByRole('button', { name: t('ui.retry') })).toBeInTheDocument();
  });

  it.each(['ar', 'en'] as const)(
    'without audit.view the route shows the 403 page (%s)',
    async (lang) => {
      signIn('CASHIER');
      vi.mocked(meApi.permissions).mockResolvedValue(permissionsFixture(['sale.create']));
      await renderApp(routes, { lang, route: '/audit' });
      expect(await screen.findByText(t('shell.forbidden.title'))).toBeInTheDocument();
      expect(auditApi.search).not.toHaveBeenCalled();
    },
  );
});
