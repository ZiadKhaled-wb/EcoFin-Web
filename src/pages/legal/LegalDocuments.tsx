import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import Skeleton from '@/components/ui/Skeleton';
import { ApiError } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { legalApi, legalKeys } from '@/services/legalApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';

/**
 * The papers of a case (F14: purpose legal_document, entity legal_case). Uploading needs
 * legal.manage; the server lets a lawyer list, open or add papers of their own cases only.
 */
export default function LegalDocuments({
  caseId,
  canUpload,
}: {
  caseId: string;
  canUpload: boolean;
}) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const files = useQuery({
    queryKey: legalKeys.files(orgId, caseId),
    queryFn: () => legalApi.files(caseId),
    retry: false,
  });

  async function upload(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      await legalApi.uploadDocument(caseId, file);
      await cache.invalidateQueries({ queryKey: legalKeys.files(orgId, caseId) });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'FILE_TYPE_NOT_ALLOWED'
          ? t('legal.documents.typeNotAllowed')
          : err instanceof ApiError && err.code === 'FILE_TOO_LARGE'
            ? t('legal.documents.tooLarge')
            : t('legal.documents.uploadFailed'),
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function open(fileId: string) {
    setError('');
    try {
      const { url } = await legalApi.documentUrl(fileId);
      window.open(url, '_blank', 'noopener');
    } catch {
      setError(t('legal.documents.openFailed'));
    }
  }

  const items = (files.data?.items ?? []).filter((f) => f.purpose === 'legal_document');

  return (
    <Card
      title={t('legal.documents.title')}
      actions={
        canUpload ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="sr-only"
              aria-label={t('legal.documents.upload')}
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => fileRef.current?.click()}
            >
              {t('legal.documents.upload')}
            </Button>
          </>
        ) : undefined
      }
    >
      {files.isPending ? (
        <Skeleton className="h-16" />
      ) : files.isError ? (
        <ErrorState title={t('legal.documents.loadFailed')} onRetry={() => void files.refetch()} />
      ) : items.length === 0 ? (
        <p className="type-caption">{t('legal.documents.empty')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span dir="auto">
                {f.originalName ?? t('legal.documents.unnamed')}
                <span className="type-caption block">{formatDateTime(f.createdAt)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void open(f.id)}>
                {t('legal.documents.open')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FormError message={error} />
      <p className="type-caption mt-2">{t('legal.documents.hint')}</p>
    </Card>
  );
}
