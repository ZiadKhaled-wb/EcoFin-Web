import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ImportJobSummary } from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { formatDateTime, formatNumber } from '@/lib/format';
import { importKeys, importsApi } from '@/services/importsApi';
import { useAuthStore } from '@/store/authStore';
import ImportReportView from './ImportReportView';
import { STATUS_TONE, apiErrorText } from './importShared';

const th = 'type-label px-3 py-2 text-start';
const td = 'type-body px-3 py-2 text-start align-top';

/** The report of one past import, read in full when opened. */
function ReportDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const job = useQuery({
    queryKey: importKeys.one(orgId, id),
    queryFn: () => importsApi.get(id),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('imports.history.reportTitle')}
      className="max-w-4xl!"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('imports.wizard.close')}
        </Button>
      }
    >
      {job.isLoading && <LoadingState />}
      {job.isError && <ErrorState onRetry={() => void job.refetch()} />}
      {job.data && <ImportReportView job={job.data} />}
    </Dialog>
  );
}

/** Past imports, newest first: open a report, or cancel one that is checked but not run. */
export default function ImportHistory() {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [viewing, setViewing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<ImportJobSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useInfiniteQuery({
    queryKey: importKeys.list(orgId, { limit: 25 }),
    queryFn: ({ pageParam }) =>
      importsApi.list({ limit: 25, ...(pageParam ? { cursor: pageParam } : {}) }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  async function cancel() {
    if (!cancelling) return;
    setBusy(true);
    setError('');
    try {
      await importsApi.cancel(cancelling.id);
      notify.success(t('imports.status.cancelled'));
      setCancelling(null);
      await cache.invalidateQueries({ queryKey: importKeys.lists(orgId) });
    } catch (err) {
      setError(apiErrorText(err, cancelling.kind));
    } finally {
      setBusy(false);
    }
  }

  if (list.isLoading) return <LoadingState />;
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;
  if (items.length === 0) {
    return (
      <EmptyState title={t('imports.history.empty')} description={t('imports.history.emptyHint')} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-max">
          <caption className="sr-only">{t('imports.tabs.history')}</caption>
          <thead className="bg-surface-muted">
            <tr>
              {(
                ['kind', 'file', 'status', 'counts', 'errors', 'by', 'when', 'actions'] as const
              ).map((c) => (
                <th key={c} className={th}>
                  {t(`imports.history.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((job) => (
              <tr key={job.id}>
                <td className={td}>{t(`imports.kinds.${job.kind}.title`)}</td>
                <td className={td} dir="auto">
                  {job.file_name ?? ''}
                </td>
                <td className={td}>
                  <Badge tone={STATUS_TONE[job.status]}>{t(`imports.status.${job.status}`)}</Badge>
                </td>
                <td className={td + ' num'}>
                  {job.actions
                    ? `${formatNumber(job.actions.create)} / ${formatNumber(job.actions.update)} / ${formatNumber(job.actions.unchanged)}`
                    : ''}
                </td>
                <td className={td + ' num'}>{formatNumber(job.errors_total)}</td>
                <td className={td}>{job.created_by?.name ?? ''}</td>
                <td className={td}>{formatDateTime(job.created_at)}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(job.id)}>
                      {t('imports.history.view')}
                    </Button>
                    {job.status === 'validated' && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(job)}>
                        {t('imports.history.cancel')}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          loading={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('imports.history.loadMore')}
        </Button>
      )}
      {viewing && <ReportDialog id={viewing} onClose={() => setViewing(null)} />}
      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && !busy && setCancelling(null)}
        title={t('imports.history.cancelTitle')}
        description={t('imports.history.cancelText')}
        footer={
          <>
            <div className="me-auto min-w-0 flex-1">
              <FormError message={error} />
            </div>
            <Button variant="secondary" disabled={busy} onClick={() => setCancelling(null)}>
              {t('imports.history.cancelNo')}
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void cancel()}>
              {t('imports.history.cancelYes')}
            </Button>
          </>
        }
      />
    </div>
  );
}
