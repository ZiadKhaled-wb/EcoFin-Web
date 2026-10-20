import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Uuid, type ContractDocumentKind } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import ContractDocument from '@/features/contractDocuments/ContractDocument';
import PromissoryNotes from '@/features/contractDocuments/PromissoryNotes';
import { DOC } from '@/features/contractDocuments/documentText';
import { PRINT_LOG_WAIT_MS } from '@/features/receipts/receiptRules';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { contractDocumentsApi } from '@/services/contractDocumentsApi';
import { settingsApi } from '@/services/settingsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/** A logo that neither loads nor fails never blocks the print for longer than this (S04). */
const LOGO_WAIT_MS = 4000;

const PAGE_CSS = `@page { size: A4 portrait; margin: 12mm 12mm 18mm; @bottom-center { content: "${DOC.page} " counter(page) " ${DOC.of} " counter(pages); font-size: 9pt; } }`;

/**
 * N07 (D82): `/contracts/:id/print?doc=contract|notes`. Loads the documents read (full national
 * IDs: kept only while this view is open), shows the paper with its COPY mark, logs the print on
 * "Print" (the server numbers it: the first of a schedule version is the original) and then calls
 * `window.print()`. Without an answer from the server (an expired shop, offline) the paper is
 * printed as a COPY.
 */
export default function ContractPrintPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const kind: ContractDocumentKind =
    params.get('doc') === 'notes' ? 'promissory_notes' : 'contract';
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: ['contract-documents', orgId, id],
    queryFn: () => contractDocumentsApi.get(id),
    enabled: validId,
    retry: false,
    // National IDs: nothing is kept once this view is closed.
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const docs = query.data;
  const logoId = docs?.shop.logo_file_id ?? null;
  const logo = useQuery({
    queryKey: ['settings-logo', logoId],
    queryFn: () => settingsApi.logoUrl(logoId!),
    enabled: !!logoId,
    retry: false,
  });
  const [logoSettled, setLogoSettled] = useState(false);
  useEffect(() => {
    if (!logoId) return;
    const timer = setTimeout(() => setLogoSettled(true), LOGO_WAIT_MS);
    return () => clearTimeout(timer);
  }, [logoId]);
  const logoPending = !!logoId && !logo.isError && !logoSettled;

  const [printing, setPrinting] = useState(false);
  const [stamp, setStamp] = useState<boolean | null>(null);
  const [notLogged, setNotLogged] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  if (!validId) return <Missing />;
  if (query.isError && !docs) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    if (status === 404) return <Missing />;
    return (
      <PageContainer>
        <ErrorState
          title={t(
            status === 403
              ? 'contractDocuments.page.forbidden'
              : 'contractDocuments.page.loadFailed',
          )}
          onRetry={status === 403 ? undefined : () => void query.refetch()}
        />
      </PageContainer>
    );
  }
  if (!docs) return <LoadingState />;

  const counter = docs.prints[kind];
  const copy = stamp ?? counter.copy;
  const noNotes = kind === 'promissory_notes' && docs.notes.length === 0;
  const ready = !logoPending && !noNotes;
  const logoUrl = logo.data?.url ?? null;

  async function print() {
    if (!ready || printing) return;
    setPrinting(true);
    let isCopy = counter.copy;
    let logged = true;
    try {
      const result = await Promise.race([
        contractDocumentsApi.recordPrint(id, kind),
        new Promise<never>((_, reject) => setTimeout(reject, PRINT_LOG_WAIT_MS)),
      ]);
      isCopy = result.copy;
    } catch {
      // Not logged (an expired shop, offline): the paper still goes out, marked COPY.
      isCopy = true;
      logged = false;
    }
    if (!alive.current) return;
    flushSync(() => {
      setNotLogged(!logged);
      setStamp(isCopy);
    });
    window.print();
    setStamp(null);
    setPrinting(false);
    void query.refetch();
  }

  const paper =
    kind === 'contract' ? (
      <ContractDocument
        docs={docs}
        copy={copy}
        logoUrl={logoUrl}
        onLogoSettled={() => setLogoSettled(true)}
      />
    ) : (
      <PromissoryNotes docs={docs} copy={copy} />
    );

  return (
    <PageContainer>
      <PageHeader
        title={t(
          kind === 'contract'
            ? 'contractDocuments.page.titleContract'
            : 'contractDocuments.page.titleNotes',
          { number: docs.contract.number },
        )}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/contracts/${id}`} className="btn btn-ghost">
              {t('contractDocuments.page.back')}
            </Link>
            <Button
              disabled={!ready}
              loading={printing || logoPending}
              onClick={() => void print()}
            >
              {t('contractDocuments.page.print')}
            </Button>
          </div>
        }
      />
      <div className="space-y-3">
        <Notice tone="info">
          {t(
            counter.copy
              ? 'contractDocuments.page.copyNote'
              : 'contractDocuments.page.originalNote',
          )}
        </Notice>
        {kind === 'promissory_notes' && !noNotes && (
          <p className="type-caption">
            {t('contractDocuments.page.noteCount', { count: formatNumber(docs.notes.length) })}
          </p>
        )}
        {notLogged && <Notice tone="error">{t('contractDocuments.page.notLogged')}</Notice>}
        {noNotes ? (
          <EmptyState title={t('contractDocuments.page.noNotes')} />
        ) : (
          <section aria-label={t('contractDocuments.page.preview')}>
            <div className="cd-preview" dir="rtl">
              {paper}
            </div>
          </section>
        )}
      </div>
      {/* Only this prints (index.css hides the rest of the page when printing). */}
      {printing &&
        stamp !== null &&
        createPortal(
          <div className="print-root" data-contract-print>
            <style>{PAGE_CSS}</style>
            {paper}
          </div>,
          document.body,
        )}
    </PageContainer>
  );
}

function Missing() {
  return (
    <PageContainer>
      <EmptyState role="alert" title={t('contractDocuments.page.notFound')} />
    </PageContainer>
  );
}
