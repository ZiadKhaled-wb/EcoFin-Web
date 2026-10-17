import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CollectionNotReversibleDetail, Uuid, type Collection } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import Notice from '@/components/ui/Notice';
import Textarea from '@/components/ui/Textarea';
import { useCan } from '@/features/me/useCan';
import { useSettings } from '@/features/settings/useSettings';
import { receiptPageCss } from '@/features/receipts/receiptPrefs';
import { ApiError } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { collectionKeys, collectionsApi } from '@/services/collectionsApi';
import { useAuthStore } from '@/store/authStore';
import { getLanguage, t } from '@/i18n';
import CollectionReceipt from './CollectionReceipt';

const MM_PER_PX = 25.4 / 96;

function NotFound() {
  return (
    <PageContainer>
      <EmptyState role="alert" title={t('collections.receipt.notFound')} />
    </PageContainer>
  );
}

/**
 * N03 (D78): a collection receipt: what was paid on which installments, how, and what is left. It
 * prints on the shop's roll (the first print is the original, later ones copies: the server keeps
 * the print log). With collection.reverse a collection of today can be reversed: the money goes
 * back and the installments are unpaid again.
 */
export default function CollectionReceiptPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const canReverse = useCan('collection.reverse');
  const canCollect = useCan('collection.create');
  const [printing, setPrinting] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: collectionKeys.receipt(orgId, id),
    queryFn: () => collectionsApi.receipt(id),
    enabled: validId,
    retry: false,
  });

  if (!validId) return <NotFound />;
  if (query.isError && !query.data) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFound />;
    return (
      <PageContainer>
        <ErrorState
          title={t('collections.receipt.loadFailed')}
          onRetry={() => void query.refetch()}
        />
      </PageContainer>
    );
  }
  const c = query.data;
  if (!c) return <LoadingState />;
  const first = c.contracts[0];

  return (
    <PageContainer>
      <PageHeader
        title={t('collections.receipt.title', { number: c.number })}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPrinting(true)}>
              {t('collections.receipt.print')}
            </Button>
            {canReverse && !c.reversal && (
              <Button variant="danger" onClick={() => setReversing(true)}>
                {t('collections.reverse.button')}
              </Button>
            )}
          </div>
        }
      />
      {notice && <Notice tone="success">{notice}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Link to="/collections" className="btn btn-ghost">
          {t('collections.receipt.back')}
        </Link>
        {first && (
          <Link to={`/contracts/${first.id}`} className="btn btn-ghost">
            {t('collections.receipt.contract')}
          </Link>
        )}
        {canCollect && (
          <Link to={`/collections/new?customer=${c.customer.id}`} className="btn btn-ghost">
            {t('collections.receipt.another')}
          </Link>
        )}
      </div>
      <Card>
        <ReceiptView collection={c} copy={false} />
      </Card>
      {printing && <PrintDialog collection={c} onClose={() => setPrinting(false)} />}
      {reversing && (
        <ReverseDialog
          collection={c}
          onClose={() => setReversing(false)}
          onDone={() => {
            setReversing(false);
            setNotice(t('collections.reverse.done'));
          }}
        />
      )}
    </PageContainer>
  );
}

function ReceiptView({ collection, copy }: { collection: Collection; copy: boolean }) {
  const shop = useSettings().data;
  return (
    <div className="receipt-preview rounded-control" dir="ltr">
      <CollectionReceipt
        collection={collection}
        shopName={shop?.name ?? ''}
        timezone={shop?.timezone ?? 'Africa/Cairo'}
        widthMm={shop?.receipt_width_mm ?? 80}
        lang={shop?.default_language ?? getLanguage()}
        copy={copy}
      />
    </div>
  );
}

function PrintDialog({ collection, onClose }: { collection: Collection; onClose: () => void }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const shop = useSettings().data;
  const [copy, setCopy] = useState(collection.receipt_prints > 0);
  const [heightMm, setHeightMm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function print() {
    if (busy) return;
    setBusy(true);
    // The server numbers the prints (the first is the original). Without an answer the receipt
    // still prints, as a copy if it was printed before.
    let isCopy = copy;
    try {
      const logged = await collectionsApi.recordPrint(collection.id);
      isCopy = logged.print?.copy ?? isCopy;
      void cache.invalidateQueries({ queryKey: collectionKeys.receipt(orgId, collection.id) });
    } catch {
      /* not logged: printed anyway */
    }
    if (!alive.current) return;
    flushSync(() => setCopy(isCopy));
    const px = preview.current?.querySelector<HTMLElement>('.receipt')?.offsetHeight ?? 0;
    flushSync(() => setHeightMm(px > 0 ? Math.ceil(px * MM_PER_PX) + 6 : null));
    window.print();
    onClose();
  }

  const doc = (
    <CollectionReceipt
      collection={collection}
      shopName={shop?.name ?? ''}
      timezone={shop?.timezone ?? 'Africa/Cairo'}
      widthMm={shop?.receipt_width_mm ?? 80}
      lang={shop?.default_language ?? getLanguage()}
      copy={copy}
    />
  );
  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('collections.receipt.printTitle', { number: collection.number })}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t('collections.receipt.close')}
          </Button>
          <Button loading={busy} disabled={!shop} onClick={() => void print()}>
            {t('collections.receipt.printNow')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {copy && <p className="type-caption">{t('collections.receipt.copyNote')}</p>}
        <div ref={preview} className="receipt-preview rounded-control" dir="ltr">
          {doc}
        </div>
      </div>
      {shop &&
        createPortal(
          <div className="print-root" data-receipt-print dir="ltr">
            <style>{receiptPageCss('thermal', shop.receipt_width_mm, heightMm)}</style>
            {doc}
          </div>,
          document.body,
        )}
    </Dialog>
  );
}

function ReverseDialog({
  collection,
  onClose,
  onDone,
}: {
  collection: Collection;
  onClose: () => void;
  onDone: () => void;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const [reason, setReason] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ok = reason.trim().length >= 3;

  async function reverse() {
    if (!ok || busy) return;
    setBusy(true);
    setError('');
    try {
      const answer = await collectionsApi.reverse(collection.id, reason.trim(), key);
      cache.setQueryData(collectionKeys.receipt(orgId, collection.id), answer);
      void cache.invalidateQueries({ queryKey: collectionKeys.all(orgId) });
      onDone();
    } catch (err) {
      setError(reverseError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => !v && !busy && onClose()}
      title={t('collections.reverse.title', { number: collection.number })}
      description={t('collections.reverse.description')}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t('collections.reverse.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!ok || busy}
            onClick={() => void reverse()}
          >
            {t('collections.reverse.confirm')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="type-body">
          {t('collections.reverse.back', { amount: formatMoney(collection.amount) })}
        </p>
        <ul className="type-caption space-y-1">
          {collection.payments.map((p) => (
            <li key={p.id}>
              {t('collections.reverse.line', {
                method: t(`collections.receipt.doc.method.${p.method}`),
                amount: formatMoney(p.amount),
              })}
            </li>
          ))}
        </ul>
        <Textarea
          label={t('collections.reverse.reason')}
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
        />
        <FormError message={error} />
      </div>
    </Dialog>
  );
}

function reverseError(err: unknown): string {
  if (!(err instanceof ApiError)) return t('collections.reverse.errors.failed');
  if (err.code === 'COLLECTION_NOT_REVERSIBLE') {
    const detail = CollectionNotReversibleDetail.safeParse(err.details);
    if (detail.success) return t(`collections.reverse.errors.${detail.data.reason}`);
  }
  if (err.code === 'INSUFFICIENT_FUNDS') return t('collections.reverse.errors.insufficient');
  return t('collections.reverse.errors.failed');
}
