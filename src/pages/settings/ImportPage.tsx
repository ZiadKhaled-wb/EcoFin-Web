import { useRef, useState } from 'react';
import { IMPORT_KIND_ORDER, type ImportKind } from '@ziadkhaled-wb/contracts';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import PageContainer from '@/components/ui/PageContainer';
import { notify } from '@/components/ui/notify';
import ImportHistory from '@/features/imports/ImportHistory';
import ImportWizard from '@/features/imports/ImportWizard';
import { saveBlob } from '@/features/imports/importShared';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { importsApi } from '@/services/importsApi';

const TABS = ['new', 'history'] as const;
type Tab = (typeof TABS)[number];

function KindCard({
  kind,
  active,
  onStart,
}: {
  kind: ImportKind;
  active: boolean;
  onStart: () => void;
}) {
  const [busy, setBusy] = useState<'xlsx' | 'csv' | null>(null);
  async function download(format: 'xlsx' | 'csv') {
    setBusy(format);
    try {
      const blob = await importsApi.template(kind, format);
      saveBlob(blob, `ecofin-import-${kind.replaceAll('_', '-')}-template.${format}`);
    } catch {
      notify.error(t('imports.template.failed'));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card
      title={t(`imports.kinds.${kind}.title`)}
      description={t(`imports.kinds.${kind}.description`)}
      className={cn(active && 'ring-2 ring-brand-600')}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-caption">{t('imports.template.label')}</span>
          {(['xlsx', 'csv'] as const).map((format) => (
            <Button
              key={format}
              size="sm"
              variant="secondary"
              loading={busy === format}
              aria-label={`${t('imports.template.label')} ${t(`imports.template.${format}`)} ${t(`imports.kinds.${kind}.title`)}`}
              onClick={() => void download(format)}
            >
              {t(`imports.template.${format}`)}
            </Button>
          ))}
        </div>
        <Button onClick={onStart}>{t('imports.start')}</Button>
      </div>
    </Card>
  );
}

/**
 * M01 import (import.data): download a template, upload a file, match its columns, check every
 * row (nothing is saved), import. The History tab keeps every past import with its report.
 */
export default function ImportPage() {
  const [tab, setTab] = useState<Tab>('new');
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [run, setRun] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onTabKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const dir = (e.key === 'ArrowRight' ? 1 : -1) * (document.dir === 'rtl' ? -1 : 1);
    const next = TABS[(index + dir + TABS.length) % TABS.length]!;
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <PageContainer>
      <PageHeader title={t('imports.title')} description={t('imports.description')} />
      <div
        role="tablist"
        aria-label={t('imports.title')}
        className="mb-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((id, index) => (
          <button
            key={id}
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
            id={`imports-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`imports-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => setTab(id)}
            onKeyDown={(e) => onTabKey(e, index)}
            className={cn(
              'type-body min-h-11 shrink-0 border-b-2 px-4 whitespace-nowrap transition-colors',
              tab === id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ink-mute hover:text-ink',
            )}
          >
            {t(`imports.tabs.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'new' && (
        <div
          id="imports-panel-new"
          role="tabpanel"
          aria-labelledby="imports-tab-new"
          className="space-y-6"
        >
          <p className="type-caption">{t('imports.order')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {IMPORT_KIND_ORDER.map((k) => (
              <KindCard
                key={k}
                kind={k}
                active={kind === k}
                onStart={() => {
                  setKind(k);
                  setRun((n) => n + 1);
                }}
              />
            ))}
          </div>
          {kind && (
            <ImportWizard key={`${kind}-${run}`} kind={kind} onClose={() => setKind(null)} />
          )}
        </div>
      )}
      {tab === 'history' && (
        <div id="imports-panel-history" role="tabpanel" aria-labelledby="imports-tab-history">
          <ImportHistory />
        </div>
      )}
    </PageContainer>
  );
}
