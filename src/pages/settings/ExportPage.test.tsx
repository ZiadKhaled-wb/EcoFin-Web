import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type { ExportJob } from '@ziadkhaled-wb/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navLeaves } from '@/config/navigation';
import { meApi } from '@/features/me/meApi';
import { minutesOf } from '@/features/exports/exportShared';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { exportsApi } from '@/services/exportsApi';
import { permissionsFixture, renderApp, signIn, signOut } from '@/test/renderApp';
import ExportPage from './ExportPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.setConfig({ testTimeout: 30000 });

const ID = 'a1000000-0000-4000-8000-000000000001';
const ID2 = 'a1000000-0000-4000-8000-000000000002';
const FILE = 'a1000000-0000-4000-8000-0000000000f1';

const job = (over: Partial<ExportJob> = {}): ExportJob => ({
  id: ID,
  status: 'completed',
  requested_by: { id: ID2, name: 'Owner' },
  requested_at: '2026-10-22T10:00:00.000Z',
  finished_at: '2026-10-22T10:02:00.000Z',
  pii: 'masked',
  rows: 1234,
  size_bytes: 3 * 1024 * 1024,
  file_id: FILE,
  file_name: 'ecofin-export-shop-20261022-1000.zip',
  file_removed_at: null,
  error_code: null,
  ...over,
});
const apiError = (status: number, code: ApiError['code'], details?: unknown): ApiError => {
  const err = new ApiError(status, code, 'x');
  err.details = details;
  return err;
};
const routes = (
  <Routes>
    <Route path="/" element={<ExportPage />} />
  </Routes>
);

describe('M03 export page', () => {
  beforeEach(() => {
    signIn();
    vi.spyOn(meApi, 'permissions').mockResolvedValue(permissionsFixture(['export.data']));
    vi.spyOn(exportsApi, 'list').mockResolvedValue({ items: [] });
  });
  afterEach(() => {
    signOut();
    vi.restoreAllMocks();
  });

  it('is a settings menu item for export.data', () => {
    expect(navLeaves().find((i) => i.id === 'settings-export')).toMatchObject({
      to: '/settings/export',
      permission: 'export.data',
    });
  });

  it.each(['ar', 'en'] as const)('starts a masked export with one click (%s)', async (lang) => {
    const start = vi.spyOn(exportsApi, 'start').mockResolvedValue(job({ status: 'queued' }));
    await renderApp(routes, { lang });
    await screen.findByRole('heading', { name: t('exports.title') });
    expect(await screen.findByText(t('exports.history.empty'))).toBeInTheDocument();
    // Without customer.view_pii the choice is not offered and the export is masked.
    expect(screen.queryByLabelText(t('exports.start.fullIds'))).not.toBeInTheDocument();
    expect(screen.getByText(t('exports.start.masked'))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: t('exports.start.button') }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0]?.[0]).toEqual({ pii: 'masked' });
    expect(start.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('offers the full national IDs only with customer.view_pii, and sends the choice', async () => {
    vi.spyOn(meApi, 'permissions').mockResolvedValue(
      permissionsFixture(['export.data', 'customer.view_pii']),
    );
    const start = vi.spyOn(exportsApi, 'start').mockResolvedValue(job({ pii: 'full' }));
    await renderApp(routes, { lang: 'en' });
    const box = await screen.findByRole('checkbox');
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: t('exports.start.button') }));
    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(start.mock.calls[0]?.[0]).toEqual({ pii: 'full' });
  });

  it('lists the exports with status, rows and size, and downloads through the signed link', async () => {
    vi.spyOn(exportsApi, 'list').mockResolvedValue({
      items: [
        job(),
        job({ id: ID2, status: 'failed', file_id: null, error_code: 'EXPORT_TOO_LARGE' }),
      ],
    });
    const url = vi
      .spyOn(exportsApi, 'fileUrl')
      .mockResolvedValue({ url: 'http://localhost/signed.zip', expiresAt: '2026-10-22T10:03:00Z' });
    await renderApp(routes, { lang: 'en' });
    const row = await screen.findByTestId(`export-${ID}`);
    expect(within(row).getByText(t('exports.status.completed'))).toBeInTheDocument();
    expect(within(row).getByText('3.0 MB')).toBeInTheDocument();
    expect(within(row).getByText('1,234')).toBeInTheDocument();
    const failed = screen.getByTestId(`export-${ID2}`);
    expect(within(failed).getByText(t('exports.failure.EXPORT_TOO_LARGE'))).toBeInTheDocument();
    expect(within(failed).queryByRole('button', { name: t('exports.download') })).toBeNull();
    await userEvent.click(within(row).getByRole('button', { name: t('exports.download') }));
    await waitFor(() => expect(url).toHaveBeenCalledWith(FILE));
  });

  it('says so when the zip was removed after 7 days', async () => {
    vi.spyOn(exportsApi, 'list').mockResolvedValue({
      items: [job({ file_id: null, file_removed_at: '2026-10-29T04:00:00.000Z' })],
    });
    await renderApp(routes, { lang: 'en' });
    const row = await screen.findByTestId(`export-${ID}`);
    expect(within(row).getByText(t('exports.removed'))).toBeInTheDocument();
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('watches a running export: no second start, a cancel button, the list is read again', async () => {
    const list = vi
      .spyOn(exportsApi, 'list')
      .mockResolvedValue({ items: [job({ status: 'running', file_id: null, size_bytes: null })] });
    const cancel = vi.spyOn(exportsApi, 'cancel').mockResolvedValue(job({ status: 'cancelled' }));
    await renderApp(routes, { lang: 'en' });
    const row = await screen.findByTestId(`export-${ID}`);
    expect(within(row).getByText(t('exports.status.running'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('exports.start.button') })).toBeDisabled();
    expect(screen.getByText(t('exports.start.running'))).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: t('exports.cancel') }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(ID));
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows the refusals in words: too soon, already running, no permission', async () => {
    const start = vi.spyOn(exportsApi, 'start');
    await renderApp(routes, { lang: 'en' });
    const button = await screen.findByRole('button', { name: t('exports.start.button') });
    start.mockRejectedValueOnce(apiError(429, 'EXPORT_TOO_SOON', { retry_after: 1500 }));
    await userEvent.click(button);
    expect(
      await screen.findByText(t('exports.errors.EXPORT_TOO_SOON', { minutes: minutesOf(1500) })),
    ).toBeInTheDocument();
    expect(minutesOf(1500)).toBe(25);
    start.mockRejectedValueOnce(apiError(409, 'EXPORT_RUNNING', { job_id: ID }));
    await userEvent.click(screen.getByRole('button', { name: t('exports.start.button') }));
    await waitFor(() =>
      expect(screen.getAllByText(t('exports.errors.EXPORT_RUNNING')).length).toBeGreaterThan(0),
    );
    start.mockRejectedValueOnce(apiError(403, 'PERMISSION_DENIED'));
    await userEvent.click(screen.getByRole('button', { name: t('exports.start.button') }));
    expect(await screen.findByText(t('exports.errors.PERMISSION_DENIED'))).toBeInTheDocument();
  });

  it('a download that fails because the file is gone refreshes the list', async () => {
    vi.spyOn(exportsApi, 'list').mockResolvedValue({ items: [job()] });
    vi.spyOn(exportsApi, 'fileUrl').mockRejectedValue(apiError(404, 'FILE_NOT_FOUND'));
    await renderApp(routes, { lang: 'en' });
    const row = await screen.findByTestId(`export-${ID}`);
    await userEvent.click(within(row).getByRole('button', { name: t('exports.download') }));
    expect(await screen.findByText(t('exports.errors.FILE_NOT_FOUND'))).toBeInTheDocument();
  });
});
