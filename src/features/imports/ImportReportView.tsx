import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  IMPORT_MAX_REPORTED_ERRORS,
  type ImportJob,
  type ImportRowAction,
  type ImportRowError,
} from '@ziadkhaled-wb/contracts';
import Badge, { type BadgeTone } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import Notice from '@/components/ui/Notice';
import { notify } from '@/components/ui/notify';
import { t } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { importsApi } from '@/services/importsApi';
import { columnLabel, fieldsOf, listSeparator, rowErrorText } from './importShared';

const ACTION_TONE: Record<ImportRowAction, BadgeTone> = {
  create: 'success',
  update: 'brand',
  unchanged: 'neutral',
};

const th = 'type-label px-3 py-2 text-start';
const td = 'type-body px-3 py-2 text-start';

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className="rounded-control border border-line px-4 py-3">
      <p className="type-caption">{label}</p>
      <p
        className={tone === 'danger' ? 'type-section-title text-danger-600' : 'type-section-title'}
      >
        {formatNumber(value)}
      </p>
    </div>
  );
}

/** Opens the errors CSV (a short-lived signed link from the files API). */
export function DownloadErrors({ fileId }: { fileId: string }) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const { url } = await importsApi.fileUrl(fileId);
      window.open(url, '_blank', 'noopener');
    } catch {
      notify.error(t('imports.wizard.review.downloadFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="secondary" size="sm" loading={busy} onClick={() => void open()}>
      {t('imports.wizard.review.downloadErrors')}
    </Button>
  );
}

/**
 * What a check or an import found: counts, notes, new categories, the first rows with their
 * action and every error by row and column (with the errors CSV when the server wrote one).
 */
export default function ImportReportView({ job }: { job: ImportJob }) {
  const { report } = job;
  const kind = job.kind;
  const errorColumns: ColumnDef<ImportRowError, unknown>[] = [
    {
      id: 'row',
      header: t('imports.wizard.review.errorRow'),
      accessorFn: (e) => e.row,
      cell: ({ row }) => <span className="num">{formatNumber(row.original.row)}</span>,
      meta: { numeric: true },
    },
    {
      id: 'column',
      header: t('imports.wizard.review.errorColumn'),
      accessorFn: (e) => (e.column ? columnLabel(kind, e.column) : ''),
      cell: ({ row }) =>
        row.original.column
          ? columnLabel(kind, row.original.column)
          : t('imports.wizard.review.wholeRow'),
    },
    {
      id: 'message',
      header: t('imports.wizard.review.errorMessage'),
      accessorFn: (e) => rowErrorText(e),
      cell: ({ row }) => rowErrorText(row.original),
      meta: { wrap: true },
    },
  ];

  const previewFields = fieldsOf(kind)
    .map((c) => c.key)
    .filter((key) =>
      report.preview.some((p) => p.values[key] !== undefined && p.values[key] !== ''),
    )
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label={t('imports.actions.create')} value={report.actions.create} />
        <Tile label={t('imports.actions.update')} value={report.actions.update} />
        <Tile label={t('imports.actions.unchanged')} value={report.actions.unchanged} />
        <Tile
          label={t('imports.wizard.review.errorsCount')}
          value={report.errors_total}
          tone={report.errors_total > 0 ? 'danger' : undefined}
        />
      </div>

      {report.warnings.length > 0 && (
        <div className="space-y-1">
          <h3 className="type-label">{t('imports.wizard.review.warnings')}</h3>
          <ul className="list-disc space-y-1 ps-5">
            {report.warnings.map((w, i) => (
              <li key={i} className="type-caption">
                {w.code === 'IMPORT_UNKNOWN_COLUMN' && w.column
                  ? t('imports.wizard.columns.unused', { columns: w.column })
                  : w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.will_create_categories.length > 0 && (
        <Notice tone="info">
          {t('imports.wizard.review.categories', {
            list: report.will_create_categories.join(listSeparator()),
          })}
        </Notice>
      )}

      {report.errors.length > 0 && (
        <section className="space-y-2" aria-label={t('imports.wizard.review.errorsTitle')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="type-label">{t('imports.wizard.review.errorsTitle')}</h3>
            {job.result_file_id && <DownloadErrors fileId={job.result_file_id} />}
          </div>
          {report.errors_truncated && (
            <p className="type-caption">
              {t('imports.wizard.review.moreErrors', {
                shown: formatNumber(IMPORT_MAX_REPORTED_ERRORS),
                total: formatNumber(report.errors_total),
              })}
            </p>
          )}
          <DataTable
            caption={t('imports.wizard.review.errorsTitle')}
            columns={errorColumns}
            data={report.errors}
            getRowId={(e) => `${e.row}:${e.column ?? ''}:${e.code}`}
            searchable
            pageSize={10}
          />
        </section>
      )}

      {report.preview.length > 0 && (
        <section className="space-y-2" aria-label={t('imports.wizard.review.preview')}>
          <h3 className="type-label">{t('imports.wizard.review.preview')}</h3>
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-max">
              <caption className="sr-only">{t('imports.wizard.review.preview')}</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th className={th}>{t('imports.wizard.review.row')}</th>
                  <th className={th}>{t('imports.wizard.review.action')}</th>
                  {previewFields.map((key) => (
                    <th key={key} className={th}>
                      {columnLabel(kind, key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.preview.map((p) => (
                  <tr key={p.row}>
                    <td className={td + ' num'}>{formatNumber(p.row)}</td>
                    <td className={td}>
                      <Badge tone={ACTION_TONE[p.action]}>{t(`imports.actions.${p.action}`)}</Badge>
                    </td>
                    {previewFields.map((key) => (
                      <td key={key} className={td}>
                        {p.values[key] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
