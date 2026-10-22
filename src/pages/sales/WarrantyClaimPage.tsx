import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MoveWarrantyClaimBody,
  type WarrantyClaim,
  type ClaimStatus,
  type FileResponse,
} from '@ziadkhaled-wb/contracts';
import PageContainer from '@/components/ui/PageContainer';
import PageHeader from '@/components/layout/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import FormField from '@/components/ui/FormField';
import FormError from '@/components/ui/FormError';
import { notify } from '@/components/ui/notify';
import { useCan } from '@/features/me/useCan';
import { useAuthStore } from '@/store/authStore';
import { unitsApi } from '@/services/unitsApi';
import { warrantyApi, warrantyKeys } from '@/services/warrantyApi';
import { formatDateTime } from '@/lib/format';
import { t } from '@/i18n';
import { allowedClaimActions, receivedCondition } from './warrantyRules';
import {
  ClaimStatusBadge,
  WarrantyBadge,
  WarrantyLineDetails,
  SerialChain,
} from './WarrantyShared';
function ClaimPhoto({ file }: { file: FileResponse }) {
  const org = useAuthStore((s) => s.orgId);
  const query = useQuery({
    queryKey: [...warrantyKeys.all(org), 'photo', file.id],
    queryFn: () => warrantyApi.photoUrl(file.id),
  });
  return query.data ? (
    <a className="btn-link" href={query.data.url} target="_blank" rel="noreferrer">
      {file.originalName ?? t('sales.warranty.photo')}
    </a>
  ) : (
    <FormError message={query.isError ? t('sales.warranty.photoFailed') : ''} />
  );
}
export function WarrantyClaimActions({ claim }: { claim: WarrantyClaim }) {
  const manager = useCan('discount.above_cap'),
    canManage = useCan('warranty.manage'),
    org = useAuthStore((s) => s.orgId),
    client = useQueryClient();
  const [to, setTo] = useState<ClaimStatus | null>(null),
    [note, setNote] = useState(''),
    [search, setSearch] = useState(''),
    [replacement, setReplacement] = useState(''),
    [invalid, setInvalid] = useState(false);
  const units = useQuery({
    queryKey: [
      ...warrantyKeys.all(org),
      'replacement',
      claim.line.product.id,
      claim.branch_id,
      search,
    ],
    queryFn: () =>
      unitsApi.search({ status: 'in_stock', branch_id: claim.branch_id, search, pageSize: 100 }),
    enabled: to === 'replaced' && claim.line.product.serialized,
  });
  const candidates = (units.data?.items ?? []).filter(
    (u) =>
      u.product_id === claim.line.product.id &&
      u.branch_id === claim.branch_id &&
      u.status === 'in_stock',
  );
  const mutation = useMutation({
    mutationFn: () =>
      warrantyApi.move(
        claim.id,
        MoveWarrantyClaimBody.parse({
          to,
          note,
          ...(replacement ? { replacement_unit_id: replacement } : {}),
        }),
      ),
    onSuccess: async () => {
      setTo(null);
      await client.invalidateQueries({ queryKey: warrantyKeys.all(org) });
    },
  });
  // S05 (D88): the refund is a return of the claim's line; the return form opens with it ticked.
  const canRefund = useCan('refund.create');
  const navigate = useNavigate();
  const [refunding, setRefunding] = useState(false);
  const refund = async () => {
    setRefunding(true);
    try {
      const target = await warrantyApi.refund(claim.id);
      navigate(`/sales/${target.sale_id}/return?claim=${target.claim_id}`);
    } catch {
      setRefunding(false);
      notify.error(t('sales.warranty.refundFailed'));
    }
  };
  const open = (status: ClaimStatus) => {
    setTo(status);
    setNote('');
    setReplacement('');
    setSearch('');
    setInvalid(false);
    mutation.reset();
  };
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3">
        <ClaimStatusBadge status={claim.status} />
        <WarrantyBadge covered={!claim.out_of_warranty} />
      </div>
      {claim.out_of_warranty && (
        <p className="mb-3" role="status">
          {t('sales.warranty.managerNotice')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canManage &&
          allowedClaimActions(claim, manager).map((status) => (
            <Button
              key={status}
              variant={status === 'rejected' ? 'danger' : 'secondary'}
              onClick={() => open(status)}
            >
              {t(`sales.warranty.action.${status}`)}
            </Button>
          ))}
        {canRefund && ['open', 'in_repair', 'repaired'].includes(claim.status) && (
          <Button variant="secondary" loading={refunding} onClick={() => void refund()}>
            {t('sales.warranty.refund')}
          </Button>
        )}
        <Link
          className="btn-link"
          to={'/warranty/claims/' + claim.id + '/print'}
          target="_blank"
          rel="noreferrer"
        >
          {t('sales.warranty.print')}
        </Link>
      </div>
      <Dialog
        open={!!to}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setTo(null);
        }}
        title={to ? t(`sales.warranty.action.${to}`) : t('sales.warranty.move')}
        description={claim.number}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const valid = MoveWarrantyClaimBody.safeParse({
              to,
              note,
              ...(replacement ? { replacement_unit_id: replacement } : {}),
            });
            const missing =
              to === 'replaced' &&
              claim.line.product.serialized &&
              !candidates.some((u) => u.id === replacement);
            setInvalid(!valid.success || missing);
            if (valid.success && !missing && !mutation.isPending) mutation.mutate();
          }}
        >
          {to === 'replaced' && claim.line.product.serialized && (
            <>
              <FormField
                label={t('sales.warranty.replacementSearch')}
                value={search}
                disabled={mutation.isPending}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setReplacement('');
                }}
              />
              <Select
                label={t('sales.warranty.replacement')}
                value={replacement}
                disabled={mutation.isPending || units.isFetching}
                onChange={(e) => setReplacement(e.target.value)}
                options={[
                  { value: '', label: t('sales.warranty.chooseUnit') },
                  ...candidates.map((u) => ({ value: u.id, label: u.serial })),
                ]}
              />
              <FormError message={units.isError ? t('sales.warranty.loadFailed') : ''} />
            </>
          )}
          <Textarea
            label={t('sales.warranty.note')}
            value={note}
            disabled={mutation.isPending}
            onChange={(e) => setNote(e.target.value)}
          />
          <FormError
            message={
              invalid
                ? t('sales.warranty.moveInvalid')
                : mutation.isError
                  ? t('sales.warranty.moveFailed')
                  : ''
            }
          />
          <Button type="submit" loading={mutation.isPending} disabled={mutation.isPending}>
            {t('sales.warranty.confirm')}
          </Button>
        </form>
      </Dialog>
    </Card>
  );
}
export default function WarrantyClaimPage() {
  const { id } = useParams(),
    org = useAuthStore((s) => s.orgId);
  const q = useQuery({
    queryKey: [...warrantyKeys.all(org), 'claim', id],
    queryFn: () => warrantyApi.get(id!),
    enabled: !!id,
  });
  return (
    <PageContainer>
      <PageHeader title={q.data?.number ?? t('sales.warranty.claim')} />
      {q.isError ? (
        <FormError message={t('sales.warranty.loadFailed')} />
      ) : q.data ? (
        <div className="space-y-4">
          <WarrantyClaimActions claim={q.data} />
          <Card>
            <WarrantyLineDetails line={q.data.line} />
            <dl className="mt-4 space-y-3">
              <div>
                <dt>{t('sales.warranty.issue')}</dt>
                <dd className="whitespace-pre-wrap" dir="auto">
                  {q.data.issue}
                </dd>
              </div>
              <div>
                <dt>{t('sales.warranty.condition')}</dt>
                <dd className="whitespace-pre-wrap" dir="auto">
                  {receivedCondition(q.data.resolution)}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <SerialChain line={q.data.line} />
          </Card>
          <Card title={t('sales.warranty.photos')}>
            <ul className="space-y-2">
              {q.data.files.map((f) => (
                <li key={f.id}>
                  <ClaimPhoto file={f} />
                </li>
              ))}
            </ul>
          </Card>
          <Card title={t('sales.warranty.history')}>
            <ol className="space-y-3">
              {q.data.history.map((h, index) => (
                <li key={index}>
                  <p>{formatDateTime(h.at)}</p>
                  <p dir="auto">{h.note ?? t('sales.warranty.status.open')}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : (
        <p role="status">{t('sales.warranty.loading')}</p>
      )}
    </PageContainer>
  );
}
