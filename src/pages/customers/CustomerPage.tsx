import { useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Uuid } from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LoadingState from '@/components/ui/LoadingState';
import { notify } from '@/components/ui/notify';
import Can from '@/features/me/Can';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { formatBusinessDate, formatDate, formatMoney, formatNumber } from '@/lib/format';
import { customerKeys, customersApi } from '@/services/customersApi';
import { useAuthStore } from '@/store/authStore';
import { t, type TranslationKey } from '@/i18n';
import CustomerForm from './CustomerForm';
import CustomerGuarantorsCard from './CustomerGuarantorsCard';
import CustomerStatusDialog from './CustomerStatusDialog';
import { STATUS_TONE, ageOn, governorateName } from './customerShared';

const PHOTO_ERRORS: Partial<Record<string, TranslationKey>> = {
  FILE_TYPE_NOT_ALLOWED: 'customers.profile.photoType',
  FILE_TOO_LARGE: 'customers.profile.photoTooLarge',
  PERMISSION_DENIED: 'customers.errors.permission',
};

function NotFound() {
  return (
    <PageContainer>
      <EmptyState
        role="alert"
        title={t('customers.profile.notFound')}
        description={t('customers.profile.notFoundHint')}
        action={
          <Link to="/customers" className="btn btn-secondary">
            {t('customers.profile.back')}
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
 * R01 customer profile (D62): the record, the block / unblock action and the ID card photos.
 * The national ID and the photos follow customer.view_pii (the server decides; this page shows
 * what it got). An id that isn't a UUID never reaches the API. R02 adds the account to this page.
 */
export default function CustomerPage() {
  const { id = '' } = useParams();
  const validId = Uuid.safeParse(id).success;
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canEdit = useCan('customer.edit');
  const canSeePii = useCan('customer.view_pii');
  const fileRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const customer = useQuery({
    queryKey: customerKeys.one(orgId, id),
    queryFn: () => customersApi.get(id),
    enabled: validId,
  });
  const photos = useQuery({
    queryKey: customerKeys.photos(orgId, id),
    queryFn: () => customersApi.photos(id),
    enabled: validId && canSeePii,
  });
  const refresh = () => cache.invalidateQueries({ queryKey: customerKeys.all(orgId) });

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      await customersApi.uploadPhoto(id, file);
      notify.success(t('customers.profile.photoUploaded'));
      await refresh();
    } catch (err) {
      notify.error(
        t(PHOTO_ERRORS[err instanceof ApiError ? err.code : ''] ?? 'customers.profile.photoFailed'),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function view(fileId: string) {
    try {
      const { url } = await customersApi.photoUrl(fileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      notify.error(t('customers.errors.failed'));
    }
  }

  if (!validId) return <NotFound />;
  if (customer.isError && !customer.data) {
    if (customer.error instanceof ApiError && customer.error.code === 'CUSTOMER_NOT_FOUND') {
      return <NotFound />;
    }
    return (
      <PageContainer>
        <ErrorState
          title={t('customers.profile.loadFailed')}
          onRetry={() => void customer.refetch()}
        />
      </PageContainer>
    );
  }

  const data = customer.data;
  const none = <span className="type-caption">{t('customers.profile.noValue')}</span>;
  const text = (value: string | null) => value ?? none;

  return (
    <PageContainer>
      <PageHeader
        title={data ? data.full_name : t('customers.title')}
        breadcrumbs={[{ label: t('customers.profile.back'), to: '/customers' }]}
        actions={
          data && (
            <Can permission="customer.edit">
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setFormOpen(true)}>
                  {t('customers.editAction')}
                </Button>
                <Button
                  variant={data.status === 'blocked' ? 'primary' : 'danger'}
                  onClick={() => setStatusOpen(true)}
                >
                  {t(data.status === 'blocked' ? 'customers.unblock' : 'customers.block')}
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
            title={t('customers.sections.identity')}
            actions={
              <span className="flex flex-wrap gap-2">
                {data.is_business && <Badge tone="brand">{t('customers.businessBadge')}</Badge>}
                <Badge tone={STATUS_TONE[data.status]}>
                  {t(`customers.status.${data.status}`)}
                </Badge>
              </span>
            }
          >
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t('customers.fields.nationalId')}>
                {data.national_id_masked === null ? (
                  none
                ) : (
                  <>
                    <span dir="ltr" className="num">
                      {data.national_id ?? data.national_id_masked}
                    </span>
                    {data.national_id === null && (
                      <span className="type-caption block">{t('customers.profile.idHidden')}</span>
                    )}
                  </>
                )}
              </Detail>
              <Detail label={t('customers.fields.birthDate')}>
                {data.birth_date ? formatBusinessDate(data.birth_date) : none}
              </Detail>
              <Detail label={t('customers.fields.age')}>
                {data.birth_date
                  ? t('customers.fields.ageYears', { count: formatNumber(ageOn(data.birth_date)) })
                  : none}
              </Detail>
              <Detail label={t('customers.fields.gender')}>
                {data.gender ? t(`customers.gender.${data.gender}`) : none}
              </Detail>
              {data.governorate_code && (
                <Detail label={t('customers.fields.governorate')}>
                  {governorateName(data.governorate_code)}
                </Detail>
              )}
              {data.tax_registration_no && (
                <Detail label={t('customers.fields.taxNo')}>
                  <span dir="ltr">{data.tax_registration_no}</span>
                </Detail>
              )}
              <Detail label={t('customers.profile.addedOn')}>{formatDate(data.created_at)}</Detail>
            </dl>
          </Card>

          <Card title={t('customers.sections.contact')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.phones.map((phone, index) => (
                <Detail
                  key={phone}
                  label={
                    index === 0
                      ? t('customers.fields.phoneMain')
                      : t('customers.fields.phoneOther', { n: formatNumber(index + 1) })
                  }
                >
                  <span dir="ltr">{phone}</span>
                </Detail>
              ))}
              <Detail label={t('customers.fields.city')}>{text(data.city)}</Detail>
              <Detail label={t('customers.fields.address')} wide>
                {text(data.address)}
              </Detail>
            </dl>
          </Card>

          <Card title={t('customers.sections.work')}>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label={t('customers.fields.job')}>{text(data.job)}</Detail>
              <Detail label={t('customers.fields.employer')}>{text(data.employer)}</Detail>
              <Detail label={t('customers.fields.monthlyIncome')}>
                {data.monthly_income === null ? (
                  none
                ) : (
                  <span className="num">{formatMoney(data.monthly_income)}</span>
                )}
              </Detail>
              {data.notes && (
                <Detail label={t('customers.fields.notes')} wide>
                  <span className="whitespace-pre-wrap">{data.notes}</span>
                </Detail>
              )}
            </dl>
          </Card>

          <CustomerGuarantorsCard customer={data} />

          <Card
            title={t('customers.profile.photos')}
            description={t('customers.profile.photosHint')}
            actions={
              <Can permission="customer.create">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  aria-label={t('customers.profile.uploadPhoto')}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {t('customers.profile.uploadPhoto')}
                </Button>
              </Can>
            }
          >
            <p className="type-caption mb-3">
              {t('customers.profile.photosCount', { count: formatNumber(data.id_photos_count) })}
            </p>
            {!canSeePii ? (
              <p role="note">{t('customers.profile.photosHidden')}</p>
            ) : photos.isPending ? (
              <LoadingState />
            ) : (photos.data ?? []).length === 0 ? (
              <p>{t('customers.profile.photosEmpty')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {(photos.data ?? []).map((photo, index) => (
                  <li key={photo.id} className="flex items-center justify-between gap-3 py-2">
                    <span>
                      {t('customers.profile.photoName', { n: formatNumber(index + 1) })}
                      <span className="type-caption ms-2">{formatDate(photo.createdAt)}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void view(photo.id)}>
                      {t('customers.profile.viewPhoto')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      {data && canEdit && formOpen && (
        <CustomerForm
          key={data.updated_at}
          open={formOpen}
          onOpenChange={setFormOpen}
          customer={data}
          onSaved={() => void refresh()}
        />
      )}
      {data && canEdit && (
        <CustomerStatusDialog
          key={`${data.id}-${data.status}`}
          customer={statusOpen ? data : null}
          onClose={() => setStatusOpen(false)}
          onSaved={() => void refresh()}
        />
      )}
    </PageContainer>
  );
}
