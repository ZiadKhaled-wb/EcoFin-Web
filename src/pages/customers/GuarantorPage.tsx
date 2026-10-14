import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { guarantorKeys, guarantorsApi } from '@/services/guarantorsApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import GuarantorEditDialog from './GuarantorEditDialog';
import { guarantorErrorText, relationLabel } from './guarantorShared';

const PHOTO_ERRORS: Partial<Record<string, TranslationKey>> = {
  FILE_TYPE_NOT_ALLOWED: 'guarantors.page.photoType',
  FILE_TOO_LARGE: 'guarantors.page.photoTooLarge',
  PERMISSION_DENIED: 'guarantors.errors.PERMISSION_DENIED',
};

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('guarantors.page.notFound')}
        description={t('guarantors.page.notFoundHint')}
        action={
          <Link to="/customers" className="btn btn-secondary">
            {t('guarantors.back')}
          </Link>
        }
      />
    </PageContainer>
  );
}

function Detail({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="type-caption">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * R04 guarantor page (D71), reached from a customer's guarantor list: the record, its ID photos,
 * the customers it backs and its contracts. The national ID, birth date, gender and the photos
 * follow customer.view_pii (the server decides; this page shows what it got). An id that isn't a
 * UUID never reaches the API.
 */
export default function GuarantorPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canManage = useCan('guarantor.manage');
  const canSeePii = useCan('customer.view_pii');
  const fileRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const guarantor = useQuery({
    queryKey: guarantorKeys.one(orgId, id),
    queryFn: () => guarantorsApi.get(id),
    enabled: validId,
  });
  const photos = useQuery({
    queryKey: guarantorKeys.photos(orgId, id),
    queryFn: () => guarantorsApi.photos(id),
    enabled: validId && canSeePii,
  });
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: guarantorKeys.all(orgId) }),
      cache.invalidateQueries({ queryKey: ['customers', orgId, 'guarantors'] }),
    ]);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await guarantorsApi.uploadPhoto(id, file);
      notify.success(t('guarantors.page.photoUploaded'));
      await refresh();
    } catch (err) {
      notify.error(
        t(PHOTO_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'guarantors.page.photoFailed'),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function view(fileId: string) {
    try {
      const { url } = await guarantorsApi.photoUrl(fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      notify.error(t('guarantors.errors.failed'));
    }
  }

  async function toggleArchive() {
    const data = guarantor.data;
    if (!data) return;
    setSaving(true);
    try {
      if (data.archived_at) await guarantorsApi.restore(id);
      else await guarantorsApi.archive(id);
      notify.success(t(data.archived_at ? 'guarantors.page.restored' : 'guarantors.page.archived'));
      await refresh();
    } catch (err) {
      notify.error(guarantorErrorText(err instanceof ApiError ? err.code : ''));
    } finally {
      setSaving(false);
      setArchiveOpen(false);
    }
  }

  if (!validId) return <NotFound />;
  if (guarantor.isError && !guarantor.data) {
    if (guarantor.error instanceof ApiError && guarantor.error.code === 'GUARANTOR_NOT_FOUND') {
      return <NotFound />;
    }
    return (
      <PageContainer>
        <ErrorState
          title={t('guarantors.page.loadFailed')}
          onRetry={() => void guarantor.refetch()}
        />
      </PageContainer>
    );
  }

  const data = guarantor.data;
  const archived = data?.archived_at != null;
  const none = <span className="type-caption">{t('guarantors.page.noValue')}</span>;
  const text = (value: string | null) => value ?? none;

  return (
    <PageContainer>
      <PageHeader
        title={data ? data.full_name : t('guarantors.title')}
        breadcrumbs={[{ label: t('guarantors.back'), to: '/customers' }]}
        actions={
          data && (
            <Can permission="guarantor.manage">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setFormOpen(true)}>
                  {t('guarantors.page.edit')}
                </Button>
                <Button
                  variant={archived ? 'primary' : 'danger'}
                  onClick={() => setArchiveOpen(true)}
                >
                  {t(archived ? 'guarantors.page.restore' : 'guarantors.page.archive')}
                </Button>
              </div>
            </Can>
          )
        }
      />
      {!data ? (
        <LoadingState />
      ) : (
        <div className="space-y-4">
          <Card
            title={t('guarantors.page.identity')}
            actions={archived && <Badge tone="neutral">{t('guarantors.page.archivedBadge')}</Badge>}
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t('guarantors.fields.nationalId')}>
                {data.national_id_masked === null ? (
                  none
                ) : (
                  <>
                    <span dir="ltr" className="num">
                      {data.national_id ?? data.national_id_masked}
                    </span>
                    {data.national_id === null && (
                      <span className="type-caption block">{t('guarantors.page.idHidden')}</span>
                    )}
                  </>
                )}
              </Detail>
              {data.birth_date && (
                <Detail label={t('guarantors.fields.birthDate')}>
                  {formatBusinessDate(data.birth_date)}
                </Detail>
              )}
              {data.gender && (
                <Detail label={t('guarantors.fields.gender')}>
                  {t(`guarantors.gender.${data.gender}`)}
                </Detail>
              )}
              <Detail label={t('guarantors.fields.phone')}>
                <span dir="ltr">{data.phone}</span>
              </Detail>
            </dl>
            {data.also_customer && (
              <p className="mt-3" role="note">
                {t('guarantors.page.alsoCustomerNote', { name: data.also_customer.full_name })}{' '}
                <Link
                  to={`/customers/${data.also_customer.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {t('guarantors.page.openCustomer')}
                </Link>
              </p>
            )}
          </Card>

          <Card title={t('guarantors.page.contact')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t('guarantors.fields.address')} wide>
                {text(data.address)}
              </Detail>
              <Detail label={t('guarantors.fields.job')}>{text(data.job)}</Detail>
              <Detail label={t('guarantors.fields.monthlyIncome')}>
                {data.monthly_income === null ? (
                  none
                ) : (
                  <span className="num">{formatMoney(data.monthly_income)}</span>
                )}
              </Detail>
            </dl>
          </Card>

          <Card
            title={t('guarantors.page.photos')}
            description={t('guarantors.page.photosHint')}
            actions={
              <Can permission="customer.create">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label={t('guarantors.page.uploadPhoto')}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('guarantors.page.uploadPhoto')}
                </Button>
              </Can>
            }
          >
            <p className="type-caption mb-3">
              {t('guarantors.page.photosCount', { count: formatNumber(data.id_photos_count) })}
            </p>
            {!canSeePii ? (
              <p role="note">{t('guarantors.page.photosHidden')}</p>
            ) : photos.isPending ? (
              <LoadingState />
            ) : (photos.data ?? []).length === 0 ? (
              <p>{t('guarantors.page.photosEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {(photos.data ?? []).map((photo, index) => (
                  <li key={photo.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {t('guarantors.page.photoName', { n: formatNumber(index + 1) })}
                      <span className="type-caption ms-2">{formatDate(photo.createdAt)}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void view(photo.id)}>
                      {t('guarantors.page.viewPhoto')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('guarantors.page.customers')}>
            {data.customers.length === 0 ? (
              <p>{t('guarantors.page.customersEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.customers.map((c) => (
                  <li key={c.customer_id} className="flex flex-wrap items-center gap-3 py-2">
                    <Link
                      to={`/customers/${c.customer_id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {c.full_name}
                    </Link>
                    <Badge>{relationLabel(c.relation)}</Badge>
                    <span className="type-caption">
                      {t('guarantors.page.linkedOn')} {formatDate(c.linked_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={t('guarantors.page.contracts')}>
            {data.contracts.length === 0 ? (
              <p>{t('guarantors.page.contractsEmpty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start">
                  <caption className="sr-only">{t('guarantors.page.contracts')}</caption>
                  <thead>
                    <tr className="type-caption">
                      <th scope="col" className="py-2 pe-3 text-start">
                        {t('guarantors.page.contractNumber')}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-start">
                        {t('guarantors.page.customer')}
                      </th>
                      <th scope="col" className="py-2 pe-3 text-start">
                        {t('guarantors.columns.status')}
                      </th>
                      <th scope="col" className="py-2 text-start">
                        {t('guarantors.page.total')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.contracts.map((c) => (
                      <tr key={c.contract_id}>
                        <td className="py-2 pe-3">
                          <span dir="ltr">{c.number}</span>
                        </td>
                        <td className="py-2 pe-3">
                          <Link
                            to={`/customers/${c.customer_id}`}
                            className="text-brand-700 hover:underline"
                          >
                            {c.customer_name}
                          </Link>
                        </td>
                        <td className="py-2 pe-3">
                          <Badge tone={c.status === 'active' ? 'warning' : 'neutral'}>
                            {t(`guarantors.page.contractStatus.${c.status}`)}
                          </Badge>
                        </td>
                        <td className="num py-2">{formatMoney(c.total_payable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
      {data && canManage && formOpen && (
        <GuarantorEditDialog
          key={data.updated_at}
          open={formOpen}
          onOpenChange={setFormOpen}
          guarantor={data}
          onSaved={() => void refresh()}
        />
      )}
      {data && canManage && (
        <ConfirmDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          title={t(archived ? 'guarantors.page.restoreTitle' : 'guarantors.page.archiveTitle')}
          description={t(
            archived ? 'guarantors.page.restoreDescription' : 'guarantors.page.archiveDescription',
            { name: data.full_name },
          )}
          confirmLabel={t(archived ? 'guarantors.page.restore' : 'guarantors.page.archive')}
          tone={archived ? 'primary' : 'danger'}
          loading={saving}
          onConfirm={() => void toggleArchive()}
        />
      )}
    </PageContainer>
  );
}
