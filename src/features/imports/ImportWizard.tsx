import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  missingImportColumns,
  type ImportInspection,
  type ImportJob,
  type ImportKind,
} from '@ziadkhaled-wb/contracts';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import FormError from '@/components/ui/FormError';
import Notice from '@/components/ui/Notice';
import Select from '@/components/ui/Select';
import { useBranches } from '@/features/me/useBranches';
import { t } from '@/i18n';
import { formatNumber } from '@/lib/format';
import { customerKeys } from '@/services/customersApi';
import { importKeys, importsApi } from '@/services/importsApi';
import { productKeys } from '@/services/productsApi';
import { stockKeys } from '@/services/stockApi';
import { supplierKeys } from '@/services/suppliersApi';
import { useAuthStore } from '@/store/authStore';
import ImportReportView, { DownloadErrors } from './ImportReportView';
import {
  FINAL_STATUSES,
  KIND_LINK,
  apiErrorText,
  columnLabel,
  fieldsOf,
  groupLabel,
  listSeparator,
} from './importShared';

type Mapping = Record<string, string>;
type Phase = 'file' | 'columns' | 'review' | 'running';

const STEPS = ['file', 'columns', 'review', 'import'] as const;

function Steps({ phase }: { phase: Phase }) {
  const current = phase === 'running' ? 3 : phase === 'review' ? 2 : phase === 'columns' ? 1 : 0;
  return (
    <ol className="flex flex-wrap gap-2" aria-label={t('imports.wizard.steps.file')}>
      {STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={i === current ? 'step' : undefined}
          className={
            i === current
              ? 'type-label rounded-control bg-brand-50 px-3 py-1 text-brand-700'
              : 'type-label rounded-control px-3 py-1 text-ink-mute'
          }
        >
          {i + 1}. {t(`imports.wizard.steps.${step}`)}
        </li>
      ))}
    </ol>
  );
}

/**
 * One import, start to finish: choose the file, match its columns, check every row (nothing is
 * saved), then import. Mounted per start, so the keys below are new for a new import.
 */
export default function ImportWizard({ kind, onClose }: { kind: ImportKind; onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const branches = useBranches();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('file');
  const [file, setFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState('');
  const [sheet, setSheet] = useState<string | undefined>(undefined);
  const [inspection, setInspection] = useState<ImportInspection | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  // One idempotency key per distinct input: pressing the button twice is one dry run.
  const createKey = useRef<{ sig: string; key: string }>({ sig: '', key: '' });
  const runKey = useRef<{ id: string; key: string }>({ id: '', key: '' });

  const kindTitle = t(`imports.kinds.${kind}.title`);
  const effectiveBranch = branchId || branches.data?.[0]?.id || '';

  function reset() {
    setPhase('file');
    setFile(null);
    setFileId(null);
    setSheet(undefined);
    setInspection(null);
    setMapping({});
    setJob(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  /** Reads the file (sheet = which sheet) and offers the automatic column match. */
  async function inspect(id: string, which: string | undefined) {
    const result = await importsApi.inspect({
      kind,
      file_id: id,
      ...(which ? { sheet: which } : {}),
    });
    setInspection(result);
    setSheet(result.sheet ?? undefined);
    setMapping(result.suggestion.mapping);
    setPhase('columns');
  }

  async function readFile() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const uploaded = await importsApi.upload(file);
      setFileId(uploaded.id);
      await inspect(uploaded.id, undefined);
    } catch (err) {
      setFileId(null);
      setError(apiErrorText(err, kind));
    } finally {
      setBusy(false);
    }
  }

  async function changeSheet(next: string) {
    if (!fileId) return;
    setBusy(true);
    setError('');
    try {
      await inspect(fileId, next);
    } catch (err) {
      setError(apiErrorText(err, kind));
    } finally {
      setBusy(false);
    }
  }

  /** A header goes to one field only: choosing it here frees it from the field that had it. */
  function setField(field: string, header: string) {
    setMapping((current) => {
      const next: Mapping = {};
      for (const [key, value] of Object.entries(current)) {
        if (key !== field && !(header && value === header)) next[key] = value;
      }
      if (header) next[field] = header;
      return next;
    });
  }

  const missing = missingImportColumns(kind, Object.keys(mapping));

  async function check() {
    if (!fileId) return;
    setBusy(true);
    setError('');
    const sig = JSON.stringify([kind, fileId, sheet ?? null, effectiveBranch, mapping]);
    if (createKey.current.sig !== sig) createKey.current = { sig, key: crypto.randomUUID() };
    try {
      const result = await importsApi.create({
        kind,
        file_id: fileId,
        ...(kind === 'opening_stock' ? { branch_id: effectiveBranch } : {}),
        ...(sheet ? { sheet } : {}),
        mapping,
        idempotency_key: createKey.current.key,
      });
      setJob(result);
      setPhase('review');
      void cache.invalidateQueries({ queryKey: importKeys.lists(orgId) });
    } catch (err) {
      setError(apiErrorText(err, kind));
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!job) return;
    setBusy(true);
    setError('');
    if (runKey.current.id !== job.id) runKey.current = { id: job.id, key: crypto.randomUUID() };
    try {
      const started = await importsApi.run(job.id, { idempotency_key: runKey.current.key });
      setJob(started);
      setConfirming(false);
      setPhase('running');
      void cache.invalidateQueries({ queryKey: importKeys.lists(orgId) });
    } catch (err) {
      setConfirming(false);
      setError(apiErrorText(err, kind));
    } finally {
      setBusy(false);
    }
  }

  const sampleOf = (header: string | undefined) =>
    header ? (inspection?.sample.find((row) => row[header])?.[header] ?? '') : '';
  const headerOptions = [...new Set((inspection?.headers ?? []).filter((h) => h !== ''))];

  return (
    <Card title={t('imports.wizard.title', { kind: kindTitle })} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Steps phase={phase} />
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('imports.wizard.close')}
        </Button>
      </div>

      {phase === 'file' && (
        <div className="space-y-4">
          <p className="type-caption">{t('imports.wizard.file.help')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label={t('imports.wizard.file.choose')}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {t('imports.wizard.file.choose')}
            </Button>
            <span className="type-body" dir="auto">
              {file ? file.name : t('imports.wizard.file.none')}
            </span>
          </div>
          {kind === 'opening_stock' && (
            <div className="max-w-sm">
              <Select
                label={t('imports.wizard.file.branch')}
                help={t('imports.wizard.file.branchHelp')}
                value={effectiveBranch}
                options={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
                onChange={(e) => setBranchId(e.target.value)}
              />
            </div>
          )}
          <FormError message={error} />
          <Button
            loading={busy}
            loadingLabel={t('imports.wizard.file.reading')}
            disabled={!file || (kind === 'opening_stock' && !effectiveBranch)}
            onClick={() => void readFile()}
          >
            {t('imports.wizard.file.next')}
          </Button>
        </div>
      )}

      {phase === 'columns' && inspection && (
        <div className="space-y-4">
          <div>
            <h3 className="type-label">{t('imports.wizard.columns.title')}</h3>
            <p className="type-caption">{t('imports.wizard.columns.help')}</p>
            <p className="type-caption">
              {t('imports.wizard.columns.rows', { count: formatNumber(inspection.total_rows) })}
            </p>
          </div>
          {inspection.sheets.length > 1 && (
            <div className="max-w-sm">
              <Select
                label={t('imports.wizard.columns.sheet')}
                value={sheet ?? ''}
                options={inspection.sheets.map((s) => ({ value: s, label: s }))}
                onChange={(e) => void changeSheet(e.target.value)}
              />
            </div>
          )}
          <div className="overflow-x-auto rounded-control border border-line">
            <table className="w-full min-w-max">
              <caption className="sr-only">{t('imports.wizard.columns.title')}</caption>
              <thead className="bg-surface-muted">
                <tr>
                  <th className="type-label px-3 py-2 text-start">
                    {t('imports.wizard.columns.field')}
                  </th>
                  <th className="type-label px-3 py-2 text-start">
                    {t('imports.wizard.columns.fileColumn')}
                  </th>
                  <th className="type-label px-3 py-2 text-start">
                    {t('imports.wizard.columns.example')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {fieldsOf(kind).map((def) => {
                  const chosen = mapping[def.key] ?? '';
                  const hint = def.required
                    ? t('imports.wizard.columns.required')
                    : def.requiredOneOf
                      ? t('imports.wizard.columns.oneOf')
                      : '';
                  return (
                    <tr key={def.key}>
                      <td className="type-body px-3 py-2 text-start">
                        <span className="block">
                          {columnLabel(kind, def.key)}
                          {(def.required || def.requiredOneOf) && ' *'}
                        </span>
                        {hint && <span className="type-caption block">{hint}</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          label={columnLabel(kind, def.key)}
                          className="min-w-48"
                          value={chosen}
                          placeholder={t('imports.wizard.columns.notUsed')}
                          options={headerOptions.map((h) => ({ value: h, label: h }))}
                          onChange={(e) => setField(def.key, e.target.value)}
                        />
                      </td>
                      <td className="type-caption px-3 py-2 text-start" dir="auto">
                        {sampleOf(chosen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {missing.length > 0 && (
            <Notice tone="error">
              {t('imports.wizard.columns.missing', {
                fields: missing.map((m) => groupLabel(kind, m)).join(listSeparator()),
              })}
            </Notice>
          )}
          {(() => {
            const used = new Set(Object.values(mapping));
            const unused = headerOptions.filter((h) => !used.has(h));
            return unused.length > 0 ? (
              <p className="type-caption">
                {t('imports.wizard.columns.unused', { columns: unused.join(listSeparator()) })}
              </p>
            ) : null;
          })()}
          <FormError message={error} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={reset}>
              {t('imports.wizard.columns.back')}
            </Button>
            <Button
              loading={busy}
              loadingLabel={t('imports.wizard.columns.checking')}
              disabled={missing.length > 0}
              onClick={() => void check()}
            >
              {t('imports.wizard.columns.check')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'review' && job && (
        <div className="space-y-4">
          <h3 className="type-label">{t('imports.wizard.review.title')}</h3>
          <Notice tone={job.status === 'validated' ? 'success' : 'error'}>
            {t(
              job.status === 'validated' ? 'imports.wizard.review.ok' : 'imports.wizard.review.bad',
            )}
          </Notice>
          <ImportReportView job={job} />
          <FormError message={error} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => setPhase('columns')}>
              {t('imports.wizard.review.back')}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {t('imports.wizard.review.restart')}
            </Button>
            <Button disabled={job.status !== 'validated'} onClick={() => setConfirming(true)}>
              {t('imports.wizard.review.import')}
            </Button>
            {job.status !== 'validated' && (
              <span className="type-caption">{t('imports.wizard.review.importHelp')}</span>
            )}
          </div>
          <Dialog
            open={confirming}
            onOpenChange={(open) => !busy && setConfirming(open)}
            title={t('imports.wizard.confirm.title', { kind: kindTitle })}
            description={t(
              kind === 'opening_stock'
                ? 'imports.wizard.confirm.stockText'
                : 'imports.wizard.confirm.text',
              {
                create: formatNumber(job.report.actions.create),
                update: formatNumber(job.report.actions.update),
                unchanged: formatNumber(job.report.actions.unchanged),
              },
            )}
            footer={
              <>
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)}>
                  {t('imports.wizard.confirm.no')}
                </Button>
                <Button loading={busy} onClick={() => void run()}>
                  {t('imports.wizard.confirm.yes')}
                </Button>
              </>
            }
          />
        </div>
      )}

      {phase === 'running' && job && <RunningStep kind={kind} first={job} onAgain={reset} />}
    </Card>
  );
}

/** Polls the job every 2 seconds until it has finished, then shows what happened. */
function RunningStep({
  kind,
  first,
  onAgain,
}: {
  kind: ImportKind;
  first: ImportJob;
  onAgain: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: importKeys.one(orgId, first.id),
    queryFn: () => importsApi.get(first.id),
    initialData: first,
    staleTime: 0,
    refetchInterval: (q) =>
      q.state.data && FINAL_STATUSES.includes(q.state.data.status) ? false : 2000,
  });
  const job = query.data;

  const finished = FINAL_STATUSES.includes(job.status);
  // Once it has finished, what was imported shows in the lists (the job itself is left alone).
  useEffect(() => {
    if (!finished) return;
    void cache.invalidateQueries({ queryKey: importKeys.lists(orgId) });
    void cache.invalidateQueries({ queryKey: productKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: customerKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: supplierKeys.all(orgId) });
    void cache.invalidateQueries({ queryKey: stockKeys.all(orgId) });
  }, [finished, cache, orgId]);

  if (!finished) {
    return (
      <div className="space-y-2" role="status">
        <h3 className="type-label">{t('imports.wizard.running.title')}</h3>
        <p className="type-caption">{t('imports.wizard.running.text')}</p>
      </div>
    );
  }
  if (job.status === 'completed') {
    const counts = job.report.applied ?? job.report.actions;
    return (
      <div className="space-y-4">
        <Notice tone="success">{t('imports.wizard.done.title')}</Notice>
        <p className="type-body">
          {t('imports.wizard.done.text', {
            create: formatNumber(counts.create),
            update: formatNumber(counts.update),
            unchanged: formatNumber(counts.unchanged),
          })}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link to={KIND_LINK[kind]} className="btn btn-primary">
            {t('imports.wizard.done.open')}
          </Link>
          <Button variant="secondary" onClick={onAgain}>
            {t('imports.wizard.done.again')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Notice tone="error">{t('imports.wizard.failed.title')}</Notice>
      <p className="type-body">{t('imports.wizard.failed.text')}</p>
      {job.report.errors.length > 0 && <ImportReportView job={job} />}
      {job.result_file_id && job.report.errors.length === 0 && (
        <DownloadErrors fileId={job.result_file_id} />
      )}
      <Button variant="secondary" onClick={onAgain}>
        {t('imports.wizard.done.again')}
      </Button>
    </div>
  );
}
