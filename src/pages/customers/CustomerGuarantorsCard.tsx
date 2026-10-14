import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CustomerGuarantorRelationBody,
  MAX_GUARANTORS_PER_CUSTOMER,
  type Customer,
  type CustomerGuarantor,
} from '@ziadkhaled-wb/contracts';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Dialog, { ConfirmDialog } from '@/components/ui/Dialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FormError from '@/components/ui/FormError';
import LoadingState from '@/components/ui/LoadingState';
import Select from '@/components/ui/Select';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { ApiError } from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { guarantorKeys, guarantorsApi } from '@/services/guarantorsApi';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n';
import AddGuarantorDialog from './AddGuarantorDialog';
import { guarantorErrorText, relationLabel, relationOptions } from './guarantorShared';

/**
 * R04 (D71): the customer's guarantors under the customer details. Anyone who may register
 * customers (guarantor.manage or customer.create) adds; only guarantor.manage changes a relation or
 * unlinks. Editing the customer never changes this list. The ID follows customer.view_pii (the
 * server sends the mask otherwise).
 */
export default function CustomerGuarantorsCard({ customer }: { customer: Customer }) {
  const orgId = useAuthStore((s) => s.orgId);
  const cache = useQueryClient();
  const canManage = useCan('guarantor.manage');
  const canCreate = useCan('customer.create');
  const canAdd = canManage || canCreate;
  const [adding, setAdding] = useState(0);
  const [relating, setRelating] = useState<CustomerGuarantor | null>(null);
  const [unlinking, setUnlinking] = useState<CustomerGuarantor | null>(null);

  const list = useQuery({
    queryKey: guarantorKeys.ofCustomer(orgId, customer.id),
    queryFn: () => guarantorsApi.ofCustomer(customer.id),
  });
  const items = list.data ?? [];
  const refresh = () =>
    cache.invalidateQueries({ queryKey: guarantorKeys.ofCustomer(orgId, customer.id) });

  const full = items.length >= MAX_GUARANTORS_PER_CUSTOMER;
  const blocked = customer.status === 'blocked';
  const none = <span className="type-caption">{t('guarantors.page.noValue')}</span>;

  return (
    <Card
      title={t('guarantors.section.title')}
      description={t('guarantors.section.hint')}
      actions={
        canAdd &&
        !blocked && (
          <span className="flex flex-wrap items-center gap-2">
            {list.data && (
              <span className="type-caption">
                {t('guarantors.section.count', {
                  count: formatNumber(items.length),
                  max: formatNumber(MAX_GUARANTORS_PER_CUSTOMER),
                })}
              </span>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={full || !list.data}
              onClick={() => setAdding((n) => n + 1)}
            >
              {t('guarantors.section.add')}
            </Button>
          </span>
        )
      }
    >
      {blocked && canAdd && (
        <p role="note" className="type-caption mb-3">
          {t('guarantors.section.blockedHint')}
        </p>
      )}
      {full && canAdd && !blocked && (
        <p role="note" className="type-caption mb-3">
          {t('guarantors.section.limit', { count: formatNumber(MAX_GUARANTORS_PER_CUSTOMER) })}
        </p>
      )}
      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState
          title={t('guarantors.section.loadFailed')}
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title={t('guarantors.section.empty')}
          description={t('guarantors.section.emptyHint')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-start">
            <caption className="sr-only">{t('guarantors.section.title')}</caption>
            <thead>
              <tr className="type-caption text-start">
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.name')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.relation')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.phone')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.nationalId')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.status')}
                </th>
                <th scope="col" className="py-2 pe-3 text-start">
                  {t('guarantors.columns.photos')}
                </th>
                {canManage && (
                  <th scope="col" className="py-2 text-start">
                    {t('guarantors.columns.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((g) => (
                <tr key={g.id}>
                  <td className="py-2 pe-3">
                    <Link
                      to={`/customers/guarantors/${g.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {g.full_name}
                    </Link>
                  </td>
                  <td className="py-2 pe-3">{relationLabel(g.relation)}</td>
                  <td className="py-2 pe-3">
                    <span dir="ltr">{g.phone}</span>
                  </td>
                  <td className="py-2 pe-3">
                    <span dir="ltr" className="num">
                      {g.national_id ?? g.national_id_masked ?? none}
                    </span>
                  </td>
                  <td className="py-2 pe-3">
                    <span className="flex flex-wrap gap-1">
                      {g.also_customer && (
                        <Link
                          to={`/customers/${g.also_customer.id}`}
                          aria-label={t('guarantors.section.openCustomer', {
                            name: g.also_customer.full_name,
                          })}
                        >
                          <Badge tone="brand">{t('guarantors.section.alsoCustomer')}</Badge>
                        </Link>
                      )}
                      {g.on_active_contract && (
                        <Badge tone="warning">{t('guarantors.section.onContract')}</Badge>
                      )}
                      {g.archived_at && (
                        <Badge tone="neutral">{t('guarantors.page.archivedBadge')}</Badge>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pe-3">
                    {t('guarantors.section.photos', { count: formatNumber(g.id_photos_count) })}
                  </td>
                  {canManage && (
                    <td className="py-2">
                      <span className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setRelating(g)}>
                          {t('guarantors.section.changeRelation')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setUnlinking(g)}>
                          {t('guarantors.section.unlink')}
                        </Button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding > 0 && (
        <AddGuarantorDialog
          key={adding}
          open
          onOpenChange={(open) => !open && setAdding(0)}
          customer={customer}
          linkedIds={items.map((g) => g.id)}
          onDone={() => void refresh()}
        />
      )}
      {relating && (
        <RelationDialog
          key={relating.id}
          customerId={customer.id}
          guarantor={relating}
          onClose={() => setRelating(null)}
          onDone={() => void refresh()}
        />
      )}
      <ConfirmDialog
        open={unlinking !== null}
        onOpenChange={(open) => !open && setUnlinking(null)}
        title={t('guarantors.unlinkDialog.title')}
        description={
          unlinking
            ? t('guarantors.unlinkDialog.description', {
                guarantor: unlinking.full_name,
                customer: customer.full_name,
              })
            : undefined
        }
        confirmLabel={t('guarantors.unlinkDialog.confirm')}
        tone="danger"
        onConfirm={() => {
          const target = unlinking;
          if (!target) return;
          void guarantorsApi
            .unlink(customer.id, target.id)
            .then(() => {
              notify.success(t('guarantors.unlinkDialog.done'));
              void refresh();
            })
            .catch((err: unknown) =>
              notify.error(guarantorErrorText(err instanceof ApiError ? err.code : '')),
            )
            .finally(() => setUnlinking(null));
        }}
      />
    </Card>
  );
}

function RelationDialog({
  customerId,
  guarantor,
  onClose,
  onDone,
}: {
  customerId: string;
  guarantor: CustomerGuarantor;
  onClose: () => void;
  onDone: () => void;
}) {
  const [relation, setRelation] = useState<string>(guarantor.relation);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    setError('');
    const parsed = CustomerGuarantorRelationBody.safeParse({ relation });
    if (!parsed.success) {
      setError(t('guarantors.errors.relation'));
      return;
    }
    if (parsed.data.relation === guarantor.relation) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await guarantorsApi.setRelation(customerId, guarantor.id, parsed.data);
      notify.success(t('guarantors.relationDialog.saved'));
      onDone();
      onClose();
    } catch (err) {
      setError(guarantorErrorText(err instanceof ApiError ? err.code : ''));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('guarantors.relationDialog.title')}
      description={t('guarantors.relationDialog.description', { name: guarantor.full_name })}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
        noValidate
      >
        <Select
          label={t('guarantors.fields.relation')}
          options={relationOptions()}
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
        />
        <FormError message={error} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {t('guarantors.relationDialog.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('guarantors.add.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
