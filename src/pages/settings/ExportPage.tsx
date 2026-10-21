import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportJob } from '@ziadkhaled-wb/contracts';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Checkbox from '@/components/ui/Checkbox';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import PageContainer from '@/components/ui/PageContainer';
import { notify } from '@/components/ui/notify';
import {
  exportErrorText,
  failureKey,
  formatSize,
  isActive,
  runningJobOf,
  STATUS_TONE,
} from '@/features/exports/exportShared';
import { useCan } from '@/features/me/useCan';
import { t } from '@/i18n';
import { formatDateTime, formatNumber } from '@/lib/format';
import { exportKeys, exportsApi } from '@/services/exportsApi';
import { useAuthStore } from '@/store/authStore';

const th = 'type-label px-3 py-2 text-start';
const td = 'type-body px-3 py-2 text-start align-top';
/** While an export is queued or running the list is read again every 5 seconds. */
const POLL_MS = 5000;

/** Starts a download from F14's short-lived link. */
function openLink(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ExportRow({
  job,
  busy,
  onDownload,
  onCancel,
}: {
  job: ExportJob;
  busy: boolean;
  onDownload: (job: ExportJob) => void;
  onCancel: (job: ExportJob) => void;
}) {
  return (
    <tr data-testid={`export-${job.id}`}>
      <td className={td}>{formatDateTime(job.requested_at)}</td>
      <td className={td}>{job.requested_by?.name ?? ''}</td>
      <td className={td}>
        <Badge tone={STATUS_TONE[job.status]}>{t(`exports.status.${job.status}`)}</Badge>
        {job.status === 'failed' && (
          <p className="type-caption text-danger-600">{t(failureKey(job.error_code))}</p>
        )}
      </td>
      <td className={td}>{t(`exports.pii.${job.pii}`)}</td>
      <td className={td + ' num'}>{job.status === 'completed' ? formatNumber(job.rows) : ''}</td>
      <td className={td + ' num'}>{formatSize(job.size_bytes)}</td>
      <td className={td}>
        {job.file_id && (
          <Button size="sm" loading={busy} onClick={() => onDownload(job)}>
            {t('exports.download')}
          </Button>
        )}
        {job.status === 'completed' && job.file_id === null && (
          <span className="type-caption">{t('exports.removed')}</span>
        )}
        {isActive(job.status) && (
          <Button size="sm" variant="secondary" loading={busy} onClick={() => onCancel(job)}>
            {t('exports.cancel')}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Settings → Export data (export.data, also in an expired shop: it is the way out of the system).
 * One click starts a background export of every table as CSV and JSON; the list refreshes every
 * 5 seconds while one runs; the zip is downloaded through a short-lived link while it is kept (7
 * days). National IDs are masked unless the person also holds customer.view_pii and asks for them.
 */
export default function ExportPage() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canSeeIds = useCan('customer.view_pii');
  const [fullIds, setFullIds] = useState(false);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const key = useRef<string | null>(null);

  const list = useQuery({
    queryKey: exportKeys.list(orgId),
    queryFn: exportsApi.list,
    enabled: !!orgId,
    refetchInterval: (q) => (q.state.data?.items.some((j) => isActive(j.status)) ? POLL_MS : false),
  });
  const items = list.data?.items ?? [];
  const running = items.some((j) => isActive(j.status));

  async function start() {
    if (starting) return;
    setError('');
    setStarting(true);
    // One key per click: the same click sent twice never starts two exports.
    key.current = crypto.randomUUID();
    try {
      await exportsApi.start({ pii: canSeeIds && fullIds ? 'full' : 'masked' }, key.current);
      notify.success(t('exports.started'));
    } catch (e) {
      setError(exportErrorText(e));
      if (runningJobOf(e)) notify.info(t('exports.errors.EXPORT_RUNNING'));
    } finally {
      setStarting(false);
      await cache.invalidateQueries({ queryKey: exportKeys.all(orgId) });
    }
  }

  async function download(job: ExportJob) {
    if (!job.file_id) return;
    setBusyId(job.id);
    setError('');
    try {
      const link = await exportsApi.fileUrl(job.file_id);
      openLink(link.url);
    } catch (e) {
      setError(exportErrorText(e));
      await cache.invalidateQueries({ queryKey: exportKeys.all(orgId) });
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(job: ExportJob) {
    setBusyId(job.id);
    setError('');
    try {
      await exportsApi.cancel(job.id);
      notify.success(t('exports.cancelled'));
    } catch (e) {
      setError(exportErrorText(e));
    } finally {
      setBusyId(null);
      await cache.invalidateQueries({ queryKey: exportKeys.all(orgId) });
    }
  }

  return (
    <PageContainer>
      <PageHeader title={t('exports.title')} description={t('exports.description')} />
      <div className="space-y-6">
        <Card title={t('exports.contents.title')}>
          <ul className="type-body list-disc space-y-1 ps-5">
            <li>{t('exports.contents.tables')}</li>
            <li>{t('exports.contents.formats')}</li>
            <li>{t('exports.contents.manifest')}</li>
            <li>{t('exports.contents.files')}</li>
            <li>{t('exports.contents.keep')}</li>
          </ul>
        </Card>
        <Card title={t('exports.start.title')}>
          <div className="space-y-3">
            {canSeeIds ? (
              <Checkbox
                checked={fullIds}
                onChange={(e) => setFullIds(e.target.checked)}
                label={t('exports.start.fullIds')}
                description={t('exports.start.fullIdsHint')}
              />
            ) : (
              <p className="type-caption">{t('exports.start.masked')}</p>
            )}
            <FormError message={error} />
            <Button loading={starting} disabled={running} onClick={() => void start()}>
              {t('exports.start.button')}
            </Button>
            {running && <p className="type-caption">{t('exports.start.running')}</p>}
          </div>
        </Card>
        <Card title={t('exports.history.title')}>
          {list.isLoading && <LoadingState />}
          {list.isError && <ErrorState onRetry={() => void list.refetch()} />}
          {list.data && items.length === 0 && <EmptyState title={t('exports.history.empty')} />}
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <caption className="sr-only">{t('exports.history.title')}</caption>
                <thead className="bg-surface-muted">
                  <tr>
                    <th className={th}>{t('exports.history.when')}</th>
                    <th className={th}>{t('exports.history.by')}</th>
                    <th className={th}>{t('exports.history.status')}</th>
                    <th className={th}>{t('exports.history.ids')}</th>
                    <th className={th}>{t('exports.history.rows')}</th>
                    <th className={th}>{t('exports.history.size')}</th>
                    <th className={th}>
                      <span className="sr-only">{t('exports.history.actions')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((job) => (
                    <ExportRow
                      key={job.id}
                      job={job}
                      busy={busyId === job.id}
                      onDownload={(j) => void download(j)}
                      onCancel={(j) => void cancel(j)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
